import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Document as RawDocument, UpdateFilter } from 'mongodb';
import { ClientSession, Model, Types } from 'mongoose';
import { AccountDeletionException } from 'src/account/deletion/account-deletion.exception';
import {
    concludedQuestCleanupOf,
    EMPTIED_OPEN_AID_FILTER,
    EMPTY_MISSION_DRAFT_FILTER,
    erasedCharacterIdsOf,
    laneRequestIdsOf,
    missionDraftCleanupOf,
    openQuestCleanupOf,
    rescuedCountKeeperOf,
} from 'src/account/deletion/account-erasure.plan';
import { PortraitDeletionService } from 'src/account/deletion/portrait/portrait-deletion.service';
import { portraitReferencePatternOf } from 'src/account/deletion/portrait/portrait-public-id';
import {
    ChannelAccessCheck,
    ChannelAccessCheckDocument,
} from 'src/auth/channel-access/channel-access-check.model';
import {
    LoginTicket,
    LoginTicketDocument,
} from 'src/auth/login-ticket/login-ticket.model';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import {
    CharacterArchiver,
    ReleasedRescuers,
} from 'src/characters/deletion/character-archiver';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { refIdOf, sameId } from 'src/mongo/document-id';
import { PushDevice, PushDeviceDocument } from 'src/push/push-device.model';
import {
    MissionDraft,
    MissionDraftRecord,
} from 'src/quests/guided/mission-draft.model';
import { releaseRegisteredWithin } from 'src/quests/party/registered-release';
import { startedQuestsWithFilter } from 'src/quests/party/started-quest-cancel';
import {
    CancelledStartedQuest,
    StartedQuestCanceller,
} from 'src/quests/party/started-quest-canceller';

export interface ErasureReport {
    userId: Types.ObjectId;
    twitchId: string;
    // dall'archivio: push dopo il commit (piano 12)
    released: ReleasedRescuers[];
    // compagni rientrati per quest annullata: push dopo il commit (piano 12)
    cancelled: CancelledStartedQuest[];
    // socket da chiudere dopo il commit (piano 08)
    revokedSessionIds: string[];
    // da disiscrivere dal topic dopo il commit (piano 12)
    pushTokens: string[];
}

interface ErasedUser {
    role?: RoleType | null;
    twitchId: string;
    currentCharacter?: unknown;
}

// i tipi del driver non descrivono un $pull su un documento generico: l'update resta quello del piano puro
const rawUpdateOf = (update: object): UpdateFilter<RawDocument> =>
    update as UpdateFilter<RawDocument>;

interface StartedQuestCandidate {
    _id: Types.ObjectId;
    infos?: { type?: unknown } | null;
    rescue?: { characters?: unknown[] } | null;
}

// eccezione dell'utente «Si risolve come oggi» (D-13): la aid avviata che soccorre solo personaggi cancellati la conclude l'archivio
function resolvesAsToday(
    quest: StartedQuestCandidate,
    characterIds: readonly Types.ObjectId[],
): boolean {
    const wounded = quest.rescue?.characters ?? [];
    return (
        quest.infos?.type === QuestType.aid &&
        wounded.length > 0 &&
        wounded.every((each) => characterIds.some((id) => sameId(each, id)))
    );
}

interface OpenAid {
    _id: Types.ObjectId;
    startedAt?: Date | null;
}

interface CharacterPortrait {
    infos?: { imagePath?: unknown } | null;
}

interface CharacterLanes {
    quests?: Record<string, unknown> | null;
}

@Injectable()
export class AccountEraser {
    private readonly logger = new Logger(AccountEraser.name);

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        @InjectModel(MissionDraft.name)
        private readonly missionDraftModel: Model<MissionDraftRecord>,
        @InjectModel(LoginTicket.name)
        private readonly loginTicketModel: Model<LoginTicketDocument>,
        @InjectModel(PushDevice.name)
        private readonly pushDeviceModel: Model<PushDeviceDocument>,
        @InjectModel(ChannelAccessCheck.name)
        private readonly channelAccessCheckModel: Model<ChannelAccessCheckDocument>,
        private readonly startedQuestCanceller: StartedQuestCanceller,
        private readonly archiver: CharacterArchiver,
        private readonly sessionRevocation: SessionRevocationService,
        private readonly portraits: PortraitDeletionService,
    ) {}

    // dentro la transazione del chiamante (Phase 26 regola dura 1): una sola cancellazione per le due vie
    async eraseWithin(
        session: ClientSession,
        userId: Types.ObjectId,
        now: Date,
    ): Promise<ErasureReport | null> {
        const user = await this.userModel
            .findById(userId, { role: 1, twitchId: 1, currentCharacter: 1 })
            .session(session)
            .lean<ErasedUser | null>()
            .exec();
        if (!user) return null;
        // il ruolo si legge dal DB, mai dal JWT (D-16)
        if (user.role === RoleType.innkeeper) {
            throw AccountDeletionException.innkeeperProtected();
        }
        const characterIds = await this.characterIdsOf(userId, user, session);
        const cancelled = await this.cancelStartedQuestsOf(
            characterIds,
            session,
        );
        const released = [
            ...(await this.archiveCurrentOf(
                userId,
                user.currentCharacter,
                now,
                session,
            )),
            ...(await this.cleanOpenQuestsOf(characterIds, now, session)),
        ];
        await this.cleanConcludedQuestsOf(characterIds, session);
        await this.deleteLaneRequestsOf(characterIds, session);
        await this.cleanMissionDraftsOf(characterIds, session);
        await this.deleteResultsOf(userId, characterIds, session);
        await this.queuePortraitsOf(characterIds, now, session);
        await this.characterModel
            .deleteMany({ _id: { $in: characterIds } }, { session })
            .exec();
        const revokedSessionIds =
            await this.sessionRevocation.revokeForAccountDeletionWithin(
                userId.toHexString(),
                session,
            );
        await this.loginTicketModel.deleteMany({ userId }, { session }).exec();
        const pushTokens = await this.deleteDevicesOf(userId, session);
        await this.channelAccessCheckModel
            .deleteMany({ twitchId: user.twitchId }, { session })
            .exec();
        await this.userModel.deleteOne({ _id: userId }, { session }).exec();
        this.logger.log(
            `Account ${userId.toHexString()} cancellato: ${characterIds.length} personaggi, ${revokedSessionIds.length} sessioni revocate, ${pushTokens.length} device`,
        );
        return {
            userId,
            twitchId: user.twitchId,
            released,
            cancelled,
            revokedSessionIds,
            pushTokens,
        };
    }

    // gli archiviati si trovano dal proprietario, il corrente di prima della fase solo da currentCharacter (D-24)
    private async characterIdsOf(
        userId: Types.ObjectId,
        user: ErasedUser,
        session: ClientSession,
    ): Promise<Types.ObjectId[]> {
        const owned = await this.characterModel
            .find({ user: userId }, { _id: 1 })
            .session(session)
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        return erasedCharacterIdsOf(user.currentCharacter, owned);
    }

    // prima di ogni rilascio dell'archivio (D-26): la quest cominciata si annulla per tutti e non lascia segnaposto (D-13)
    private async cancelStartedQuestsOf(
        characterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<CancelledStartedQuest[]> {
        if (characterIds.length === 0) return [];
        // driver nativo: anche la registrazione con l'id in forma stringa conta (04 Pitfall 1)
        const started = await this.questModel.collection
            .find<StartedQuestCandidate>(
                startedQuestsWithFilter(characterIds),
                {
                    projection: {
                        _id: 1,
                        'infos.type': 1,
                        'rescue.characters': 1,
                    },
                    session,
                },
            )
            .toArray();
        const cancelled: CancelledStartedQuest[] = [];
        for (const quest of started) {
            if (resolvesAsToday(quest, characterIds)) continue;
            const outcome =
                await this.startedQuestCanceller.cancelStartedQuestWithin(
                    session,
                    quest._id,
                    characterIds,
                );
            if (outcome) cancelled.push(outcome);
        }
        return cancelled;
    }

    // posti non avviati, richieste GM, ferito e soccorritori come l'archivio (D-14, regola dura 3)
    private async archiveCurrentOf(
        userId: Types.ObjectId,
        currentCharacter: unknown,
        now: Date,
        session: ClientSession,
    ): Promise<ReleasedRescuers[]> {
        const characterId = refIdOf(currentCharacter);
        if (!characterId) return [];
        const { released } = await this.archiver.archiveWithinReporting(
            session,
            { userId, characterId, reason: DeletionReason.user_request, now },
        );
        return released;
    }

    // dopo l'archivio, le forme stringa che il suo cast non vede (WR-04): il posto non avviato si libera, il ferito esce dalla aid aperta
    // e la aid rimasta senza feriti si conclude come oggi (quella non avviata libera i soccorritori)
    private async cleanOpenQuestsOf(
        characterIds: readonly Types.ObjectId[],
        now: Date,
        session: ClientSession,
    ): Promise<ReleasedRescuers[]> {
        if (characterIds.length === 0) return [];
        const { seats, wounded } = openQuestCleanupOf(characterIds);
        await this.questModel.collection.updateMany(
            seats.filter,
            rawUpdateOf(seats.update),
            { session },
        );
        const aids = await this.openAidsMatching(wounded.filter, session);
        if (aids.length === 0) return [];
        const aidIds = aids.map(({ _id }) => _id);
        await this.questModel.collection.updateMany(
            { _id: { $in: aidIds } },
            rawUpdateOf(wounded.update),
            { session },
        );
        const emptied = await this.openAidsMatching(
            { _id: { $in: aidIds }, ...EMPTIED_OPEN_AID_FILTER },
            session,
        );
        if (emptied.length === 0) return [];
        await this.questModel.collection.updateMany(
            { _id: { $in: emptied.map(({ _id }) => _id) } },
            { $set: { concludedAt: now } },
            { session },
        );
        return this.releaseRescuersOf(
            emptied
                .filter(({ startedAt }) => startedAt == null)
                .map(({ _id }) => _id),
            session,
        );
    }

    private openAidsMatching(
        filter: Record<string, unknown>,
        session: ClientSession,
    ): Promise<OpenAid[]> {
        return this.questModel.collection
            .find<OpenAid>(filter, {
                projection: { _id: 1, startedAt: 1 },
                session,
            })
            .toArray();
    }

    // stessa routine del timeout e dell'archivio: la push la fa il servizio dopo il commit (D-27)
    private async releaseRescuersOf(
        aidIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<ReleasedRescuers[]> {
        const models = {
            questModel: this.questModel,
            characterModel: this.characterModel,
            pendingQuestModel: this.pendingQuestModel,
        };
        const released: ReleasedRescuers[] = [];
        for (const questId of aidIds) {
            const characterIds = await releaseRegisteredWithin(
                models,
                questId,
                session,
                this.logger,
            );
            if (characterIds.length > 0)
                released.push({ questId, characterIds });
        }
        return released;
    }

    // la conclusione e l'archivio lasciano gli id nelle quest concluse, che nessuna routine cancella (D-14)
    private async cleanConcludedQuestsOf(
        characterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<void> {
        if (characterIds.length === 0) return;
        const { seats, wounded } = concludedQuestCleanupOf(characterIds);
        // driver nativo: il cast di Mongoose ridurrebbe la forma stringa dell'id a ObjectId e la voce legacy resterebbe (04 Pitfall 1)
        await this.questModel.collection.updateMany(
            seats.filter,
            rawUpdateOf(seats.update),
            { session },
        );
        await this.questModel.collection.updateMany(
            wounded.filter,
            rawUpdateOf(wounded.update),
            { session },
        );
    }

    // riletta dopo l'archivio: le GM del corrente le ha già tolte lui, la standard resterebbe orfana (Pitfall 2)
    private async deleteLaneRequestsOf(
        characterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<void> {
        const characters = await this.characterModel
            .find({ _id: { $in: characterIds } }, { quests: 1 })
            .session(session)
            .lean<CharacterLanes[]>()
            .exec();
        const requestIds = laneRequestIdsOf(characters);
        if (requestIds.length === 0) return;
        await this.pendingQuestModel
            .deleteMany({ _id: { $in: requestIds } }, { session })
            .exec();
    }

    // solo le bozze toccate: quella rimasta senza partecipanti sparisce
    private async cleanMissionDraftsOf(
        characterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<void> {
        if (characterIds.length === 0) return;
        const { filter, update } = missionDraftCleanupOf(characterIds);
        const touched = await this.missionDraftModel
            .find(filter, { _id: 1 })
            .session(session)
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        if (touched.length === 0) return;
        const draftIds = touched.map(({ _id }) => _id);
        await this.missionDraftModel
            .updateMany({ _id: { $in: draftIds } }, update, { session })
            .exec();
        await this.missionDraftModel
            .deleteMany(
                { _id: { $in: draftIds }, ...EMPTY_MISSION_DRAFT_FILTER },
                { session },
            )
            .exec();
    }

    // i fogli altrui conservano il conteggio dei salvati con un id anonimo al posto del cancellato (D-14)
    private async deleteResultsOf(
        userId: Types.ObjectId,
        characterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<void> {
        await this.questResultModel
            .deleteMany(
                {
                    $or: [
                        { user: userId },
                        { character: { $in: [...characterIds] } },
                    ],
                },
                { session },
            )
            .exec();
        if (characterIds.length === 0) return;
        const keeper = rescuedCountKeeperOf(characterIds, new Types.ObjectId());
        // driver nativo per la stessa ragione delle quest concluse: ogni forma dell'id va sostituita
        await this.questResultModel.collection.updateMany(
            keeper.filter,
            rawUpdateOf(keeper.update),
            { session, arrayFilters: keeper.arrayFilters },
        );
    }

    // outbox nella stessa transazione, Cloudinary dopo il commit (regola dura 5): un public id ancora mostrato da un personaggio che resta,
    // archiviato o no e sotto qualunque grafia, non si tocca (CR-01)
    private async queuePortraitsOf(
        characterIds: readonly Types.ObjectId[],
        now: Date,
        session: ClientSession,
    ): Promise<void> {
        if (characterIds.length === 0) return;
        const erased = await this.characterModel
            .find({ _id: { $in: characterIds } }, { 'infos.imagePath': 1 })
            .session(session)
            .lean<CharacterPortrait[]>()
            .exec();
        const uploaded = new Set(
            erased
                .map(({ infos }) => this.portraits.publicIdOf(infos?.imagePath))
                .filter((publicId): publicId is string => publicId !== null),
        );
        if (uploaded.size === 0) return;
        for (const shown of await this.publicIdsStillShown(
            [...uploaded],
            characterIds,
            session,
        )) {
            uploaded.delete(shown);
        }
        await this.portraits.enqueueWithin(session, [...uploaded], now);
    }

    // driver nativo: nessun filtro implicito sugli archiviati, la regex vede ogni grafia dell'URL
    private async publicIdsStillShown(
        publicIds: readonly string[],
        characterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<string[]> {
        const survivors = await this.characterModel.collection
            .find<CharacterPortrait>(
                {
                    _id: { $nin: [...characterIds] },
                    'infos.imagePath': {
                        $regex: portraitReferencePatternOf(publicIds),
                    },
                },
                { projection: { 'infos.imagePath': 1 }, session },
            )
            .toArray();
        const paths = survivors
            .map(({ infos }) => infos?.imagePath)
            .filter((path): path is string => typeof path === 'string');
        return publicIds.filter((publicId) => {
            const pattern = portraitReferencePatternOf([publicId]);
            return paths.some((path) => pattern.test(path));
        });
    }

    // i token servono dopo il commit per la disiscrizione dal topic (D-25)
    private async deleteDevicesOf(
        userId: Types.ObjectId,
        session: ClientSession,
    ): Promise<string[]> {
        const devices = await this.pushDeviceModel
            .find({ userId }, { token: 1 })
            .session(session)
            .lean<{ token: string }[]>()
            .exec();
        await this.pushDeviceModel.deleteMany({ userId }, { session }).exec();
        return devices.map(({ token }) => token);
    }
}
