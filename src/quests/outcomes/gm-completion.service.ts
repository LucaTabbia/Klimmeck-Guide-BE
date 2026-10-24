import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import type {
    CompletePendingRequestInput,
    ParticipantOverrideInput,
} from 'src/models/request/complete-pending-request.model';
import { idForms, objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import {
    laneOf,
    lanePathOf,
    QuestLane,
} from 'src/quests/acceptance/quest-lanes';
import { ChanceSource } from './chance-source';
import { enemyFactsOf } from './combatant-plan';
import { overrideParticipantOf, validateOverrides } from './gm-overrides';
import { OUTCOME_CHARACTER_PROJECTION, planParticipant } from './outcome-plan';
import {
    type CommittedOutcome,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';
import { questUpdateOf } from './quest-outcome-plan';
import {
    type PendingQuestSnapshot,
    type ResolutionCatalog,
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionQuest,
} from './resolution-loader.service';
import { drawRewards } from './rewards/quest-rewards';

type GmLane = QuestLane.story | QuestLane.worldMission;

type LaneCharacter = ResolutionCharacter & {
    quests?: Partial<Record<GmLane, unknown>> | null;
};

interface GmSeat {
    character: ResolutionCharacter;
    pendingQuestId: Types.ObjectId;
    ownerId: Types.ObjectId;
    resultId: Types.ObjectId;
}

interface GmRequest {
    quest: ResolutionQuest;
    lane: GmLane;
    seats: GmSeat[];
}

interface GmCompletion {
    request: GmRequest;
    overrides: CompletePendingRequestInput['outcomes'];
    catalog: ResolutionCatalog;
    recoveryTimes: ReadonlyMap<string, number>;
    now: Date;
}

const GM_LANES: readonly GmLane[] = [QuestLane.story, QuestLane.worldMission];

const isGmLane = (lane: QuestLane): lane is GmLane =>
    (GM_LANES as readonly QuestLane[]).includes(lane);

const spellIdsOf = (
    overrides: readonly ParticipantOverrideInput[] | null | undefined,
): Types.ObjectId[] =>
    (overrides ?? []).flatMap(({ spellsUsed }) =>
        (spellsUsed ?? []).flatMap(({ spell }) => objectIdFromHex(spell) ?? []),
    );

// D-03/D-04: solo esito positivo, nessun reject né rimborso; una chiamata chiude la worldMission per tutti i registrati, un risultato ciascuno
@Injectable()
export class GmCompletionService {
    private readonly logger = new Logger(GmCompletionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly loader: ResolutionLoader,
        private readonly writer: OutcomeWriter,
        private readonly chance: ChanceSource,
        private readonly clock: Clock,
    ) {}

    async complete(
        input: CompletePendingRequestInput,
    ): Promise<Types.ObjectId[]> {
        const request = await this.readRequest(input.pendingQuestId);
        // override validati prima di ogni scrittura: un rifiuto non lascia side effect (T-09-74)
        validateOverrides(
            input.outcomes,
            request.seats.map(({ character }) =>
                overrideParticipantOf(character),
            ),
        );
        const catalog = await this.loader.readCatalog(
            request.quest,
            request.seats.map(({ character }) => character),
        );
        const recoveryTimes = new Map([
            ...catalog.recoveryTimes,
            ...(await this.loader.recoveryTimesOf(spellIdsOf(input.outcomes))),
        ]);
        const committed = await this.commit({
            request,
            overrides: input.outcomes,
            catalog,
            recoveryTimes,
            now: this.clock.now(),
        });
        // completamento concorrente già committato: il perdente vede la richiesta sparita (T-09-76)
        if (!committed) throw ResourceNotFoundException.pendingQuest();
        await this.writer.deliver(committed);
        return request.seats.map(({ resultId }) => resultId);
    }

    // solo le corsie del GM: una PendingQuest standard, inesistente o malformata è NOT_FOUND (T-09-77)
    private async readRequest(pendingQuestHex: string): Promise<GmRequest> {
        const pendingQuestId = objectIdFromHex(pendingQuestHex);
        if (!pendingQuestId) throw ResourceNotFoundException.pendingQuest();
        const pendingQuest = await this.pendingQuestModel
            .findById(pendingQuestId, { quest: 1 })
            .lean<PendingQuestSnapshot | null>()
            .exec();
        if (!pendingQuest) throw ResourceNotFoundException.pendingQuest();
        const holder = await this.characterModel
            .findOne(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    $or: GM_LANES.map((lane) => ({
                        [lanePathOf(lane)]: { $in: idForms(pendingQuestId) },
                    })),
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<LaneCharacter | null>()
            .exec();
        if (!holder) throw ResourceNotFoundException.pendingQuest();
        const quest = await this.loader.readQuest(pendingQuest);
        const lane = quest ? laneOf(quest.infos.type) : QuestLane.standard;
        if (!quest || !isGmLane(lane))
            throw ResourceNotFoundException.pendingQuest();
        const holders =
            lane === QuestLane.worldMission
                ? await this.worldMissionHolders(quest._id)
                : [holder];
        const seats = await this.seatsOf(holders, lane);
        if (seats.length === 0) throw ResourceNotFoundException.pendingQuest();
        return { quest, lane, seats };
    }

    // tutti i personaggi attivi con una PendingQuest di questa worldMission nella propria corsia (D-04, D-06)
    private async worldMissionHolders(
        questId: Types.ObjectId,
    ): Promise<LaneCharacter[]> {
        const pendingQuests = await this.pendingQuestModel
            .find({ quest: { $in: idForms(questId) } }, { _id: 1 })
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        return this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    [lanePathOf(QuestLane.worldMission)]: {
                        $in: pendingQuests.flatMap(({ _id }) => idForms(_id)),
                    },
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<LaneCharacter[]>()
            .exec();
    }

    // un partecipante senza proprietario non ha a chi consegnare il risultato: escluso con un WARN di soli id
    private async seatsOf(
        holders: readonly LaneCharacter[],
        lane: GmLane,
    ): Promise<GmSeat[]> {
        const owners = await this.loader.ownersOf(
            holders.map(({ _id }) => _id),
        );
        return holders.flatMap((character) => {
            const pendingQuestId = refIdOf(character.quests?.[lane]);
            const ownerId = owners.get(character._id.toHexString());
            if (!pendingQuestId) return [];
            if (!ownerId) {
                this.logger.warn(
                    `Personaggio ${character._id.toHexString()} della missione in attesa ${pendingQuestId.toHexString()} senza proprietario: escluso dal completamento`,
                );
                return [];
            }
            return [
                {
                    character,
                    pendingQuestId,
                    ownerId,
                    resultId: new Types.ObjectId(),
                },
            ];
        });
    }

    // una transazione per l'intera richiesta (D-21): override rivalidati sugli snapshot in sessione, un errore tipizzato abortisce
    private async commit({
        request,
        overrides,
        catalog,
        recoveryTimes,
        now,
    }: GmCompletion): Promise<CommittedOutcome | null> {
        const { quest, lane, seats } = request;
        const state: { committed: CommittedOutcome | null } = {
            committed: null,
        };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                state.committed = null;
                const snapshots: ResolutionCharacter[] = [];
                for (const seat of seats) {
                    snapshots.push(
                        await this.loader.snapshotInSession(
                            seat.character._id,
                            seat.pendingQuestId,
                            session,
                            lane,
                        ),
                    );
                }
                const battles = validateOverrides(
                    overrides,
                    snapshots.map(overrideParticipantOf),
                );
                const committed: CommittedOutcome = {
                    results: [],
                    aids: [],
                    spellRecoveries: [],
                };
                const verdicts: Parameters<
                    typeof questUpdateOf
                >[0]['verdicts'] = [];
                for (const [index, seat] of seats.entries()) {
                    const snapshot = snapshots[index];
                    const plan = planParticipant({
                        resultId: seat.resultId,
                        snapshot,
                        quest,
                        lane,
                        pendingQuestId: seat.pendingQuestId,
                        userId: seat.ownerId,
                        verdict: QuestOutcome.gmCompleted,
                        battle: battles.get(snapshot._id.toHexString()) ?? null,
                        enemy: enemyFactsOf(catalog),
                        rewards: drawRewards(
                            quest.prizes,
                            catalog.rewards,
                            this.chance,
                        ),
                        aid: null,
                        spellRecoveryTimes: recoveryTimes,
                        now,
                    });
                    await this.writer.writeParticipant(plan, session);
                    await this.writer.deletePendingQuest(
                        seat.pendingQuestId,
                        session,
                    );
                    verdicts.push({
                        characterId: snapshot._id,
                        verdict: QuestOutcome.gmCompleted,
                    });
                    committed.results.push({
                        resultId: seat.resultId,
                        userId: seat.ownerId,
                    });
                    committed.spellRecoveries.push(...plan.spellRecoveries);
                }
                // la worldMission sparisce per tutti (D-06); la story non è registrata e non ha nulla da aggiornare
                await this.writer.updateQuest(
                    { _id: quest._id },
                    questUpdateOf({ type: quest.infos.type, verdicts, now }),
                    session,
                    'bestEffort',
                );
                state.committed = committed;
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            return null;
        }
        return state.committed;
    }
}
