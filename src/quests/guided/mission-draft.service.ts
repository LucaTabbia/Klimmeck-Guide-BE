import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { isDuplicateKeyError } from 'src/mongo/mongo-errors';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import {
    assertNoBusyParticipant,
    type GmRequest,
    GmRequestReader,
} from 'src/quests/outcomes/gm-request.reader';
import { ResolutionLoader } from 'src/quests/outcomes/resolution-loader.service';
import { rewardRefsOf } from 'src/quests/outcomes/rewards/quest-rewards';
import { prizeBlockFor } from 'src/quests/prizes/rank-prizes';
import { prefilledPrizeOf } from './mission-draft-prefill';
import {
    MissionDraft,
    type MissionDraftRecord,
    MissionDraftStep,
} from './mission-draft.model';

export type MissionDraftSections = Partial<
    Pick<MissionDraft, 'step' | 'place' | 'fights' | 'prizes'>
>;

interface NamedCharacter {
    _id: Types.ObjectId;
    infos?: { name?: string | null } | null;
}

const pendingQuestIdsOf = (request: GmRequest): Types.ObjectId[] =>
    request.seats.map(({ pendingQuestId }) => pendingQuestId);

const hexOf = (id: Types.ObjectId): string => id.toHexString();

// la bozza del flusso guidato vive nel BE (D-09, D-18): il marcatore sulle PendingQuest nasce e muore con lei nella stessa transazione
@Injectable()
export class MissionDraftService {
    private readonly logger = new Logger(MissionDraftService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(MissionDraft.name)
        private readonly draftModel: Model<MissionDraft>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly requests: GmRequestReader,
        private readonly loader: ResolutionLoader,
        private readonly clock: Clock,
    ) {}

    // idempotente (D-18): da qualunque PendingQuest del gruppo, anche con due avvii concorrenti
    async start(
        pendingQuestHex: string,
        startedBy: string | null,
    ): Promise<MissionDraftRecord> {
        const request = await this.requests.read(pendingQuestHex);
        const ids = pendingQuestIdsOf(request);
        const existing = await this.draftOf(ids);
        if (existing) return existing;
        assertNoBusyParticipant(
            request.seats.map(({ character }) => character),
        );
        const draft = await this.draftDocumentOf(request, startedBy);
        try {
            await this.connection.transaction(async (session) => {
                await this.draftModel.create([draft], { session });
                const { matchedCount } =
                    await this.pendingQuestModel.updateMany(
                        { _id: { $in: ids } },
                        { $set: { missionDraftStartedAt: draft.startedAt } },
                        { session },
                    );
                if (matchedCount !== ids.length)
                    throw ResourceNotFoundException.pendingQuest();
            });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        const started = await this.draftOf(ids);
        if (!started) throw ResourceNotFoundException.missionDraft();
        this.logger.log(
            `Bozza ${hexOf(started._id)} avviata per ${started.participants.length} partecipanti`,
        );
        return started;
    }

    // una bozza senza PendingQuest vive è orfana: si cancella alla lettura (D-09, Pitfall 2)
    async read(pendingQuestHex: string): Promise<MissionDraftRecord | null> {
        const draft = await this.draftOfHex(pendingQuestHex);
        if (!draft) {
            await this.requests.read(pendingQuestHex);
            return null;
        }
        if (await this.hasLivePendingQuest(draft)) return draft;
        await this.draftModel.deleteOne({ _id: draft._id }).exec();
        this.logger.log(`Bozza orfana ${hexOf(draft._id)} cancellata`);
        return null;
    }

    async requireFor(request: GmRequest): Promise<MissionDraftRecord> {
        const draft = await this.draftOf(pendingQuestIdsOf(request));
        if (!draft) throw ResourceNotFoundException.missionDraft();
        return draft;
    }

    // marcatori riportati a null anche senza documento (D-11): mai un blocco che non si rilascia
    async discard(pendingQuestHex: string): Promise<void> {
        const draft = await this.draftOfHex(pendingQuestHex);
        const ids = [
            ...(draft?.participants.map(({ pendingQuest }) => pendingQuest) ??
                []),
            ...(await this.requestIdsOf(pendingQuestHex, draft !== null)),
        ];
        await this.connection.transaction(async (session) => {
            if (draft)
                await this.draftModel.deleteOne(
                    { _id: draft._id },
                    { session },
                );
            await this.pendingQuestModel.updateMany(
                { _id: { $in: ids } },
                { $set: { missionDraftStartedAt: null } },
                { session },
            );
        });
        this.logger.log(
            `Bozza ${draft ? hexOf(draft._id) : 'assente'} scartata, ${ids.length} marcatori azzerati`,
        );
    }

    // la sola scrittura delle sezioni (D-18): last-write-wins
    async write(
        draftId: Types.ObjectId,
        set: MissionDraftSections,
    ): Promise<MissionDraftRecord> {
        const written = await this.draftModel
            .findOneAndUpdate(
                { _id: draftId },
                { $set: { ...set, updatedAt: this.clock.now() } },
                { new: true },
            )
            .lean<MissionDraftRecord | null>()
            .exec();
        if (!written) throw ResourceNotFoundException.missionDraft();
        return written;
    }

    private async draftDocumentOf(
        request: GmRequest,
        startedBy: string | null,
    ): Promise<MissionDraft> {
        const characters = request.seats.map(({ character }) => character);
        const names = await this.namesOf(characters.map(({ _id }) => _id));
        const blocks = characters.map(({ status }) =>
            prizeBlockFor(request.quest, status.title),
        );
        const catalog = await this.loader.readRewardCatalogFor(
            rewardRefsOf(blocks),
            null,
        );
        const now = this.clock.now();
        return {
            quest: request.quest._id,
            questType:
                request.lane === QuestLane.story ? 'story' : 'worldMission',
            participants: request.seats.map(
                ({ character, pendingQuestId }) => ({
                    character: character._id,
                    pendingQuest: pendingQuestId,
                    name: names.get(hexOf(character._id)) ?? '',
                    title: character.status.title,
                    maxLifePoints: character.status.maxLifePoints ?? 0,
                }),
            ),
            step: MissionDraftStep.teleport,
            place: null,
            fights: [],
            prizes: characters.map(({ _id }, index) =>
                prefilledPrizeOf({
                    characterId: _id,
                    block: blocks[index],
                    catalog,
                }),
            ),
            startedBy: objectIdFromHex(startedBy),
            startedAt: now,
            updatedAt: now,
        };
    }

    private async namesOf(
        characterIds: readonly Types.ObjectId[],
    ): Promise<Map<string, string>> {
        const characters = await this.characterModel
            .find({ _id: { $in: characterIds } }, { 'infos.name': 1 })
            .lean<NamedCharacter[]>()
            .exec();
        return new Map(
            characters.map(({ _id, infos }) => [hexOf(_id), infos?.name ?? '']),
        );
    }

    private draftOf(
        pendingQuestIds: readonly Types.ObjectId[],
    ): Promise<MissionDraftRecord | null> {
        return this.draftModel
            .findOne({ 'participants.pendingQuest': { $in: pendingQuestIds } })
            .lean<MissionDraftRecord | null>()
            .exec();
    }

    private async draftOfHex(
        pendingQuestHex: string,
    ): Promise<MissionDraftRecord | null> {
        const pendingQuestId = objectIdFromHex(pendingQuestHex);
        if (!pendingQuestId) throw ResourceNotFoundException.pendingQuest();
        return this.draftOf([pendingQuestId]);
    }

    private async hasLivePendingQuest(
        draft: MissionDraftRecord,
    ): Promise<boolean> {
        const live = await this.pendingQuestModel
            .exists({
                _id: {
                    $in: draft.participants.map(
                        ({ pendingQuest }) => pendingQuest,
                    ),
                },
            })
            .exec();
        return live !== null;
    }

    // con la bozza in mano la richiesta sparita non blocca lo scarto; senza bozza la richiesta deve esistere
    private async requestIdsOf(
        pendingQuestHex: string,
        tolerateMissing: boolean,
    ): Promise<Types.ObjectId[]> {
        try {
            return pendingQuestIdsOf(await this.requests.read(pendingQuestHex));
        } catch (error) {
            if (tolerateMissing && error instanceof ResourceNotFoundException)
                return [];
            throw error;
        }
    }
}
