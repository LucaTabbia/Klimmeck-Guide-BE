import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type {
    CompletePendingRequestInput,
    ParticipantOverrideInput,
} from 'src/models/request/complete-pending-request.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { MissionDraft } from 'src/quests/guided/mission-draft.model';
import { ChanceSource } from './chance-source';
import type { ParticipantEffects } from './combat/combat-resolver';
import { enemyFactsOf } from './combatant-plan';
import {
    assertNoBusyParticipant,
    type GmRequest,
    GmRequestReader,
} from './gm-request.reader';
import { overrideParticipantOf, validateOverrides } from './gm-overrides';
import {
    type EnemyFacts,
    planParticipant,
    type QuestResultDraft,
} from './outcome-plan';
import {
    type CommittedOutcome,
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';
import { questUpdateOf } from './quest-outcome-plan';
import {
    type ResolutionCharacter,
    ResolutionLoader,
} from './resolution-loader.service';
import { prizeBlockFor } from '../prizes/rank-prizes';
import { type DrawnRewards, drawRewards } from './rewards/quest-rewards';
import { type VictoryKnowledge, victoryKnowledgeOf } from './victory-knowledge';

export interface GmSeatOutcome {
    battle: ParticipantEffects | null;
    enemies: EnemyFacts | null;
    victory: VictoryKnowledge | null;
    rewards: DrawnRewards;
}

// cosa scrive il ciclo condiviso dei completamenti del GM (D-08, D-25): un esito per posto, calcolato sugli snapshot in sessione
export interface GmCommitPlan {
    request: GmRequest;
    recoveryTimes: ReadonlyMap<string, number>;
    petMaxXp: ReadonlyMap<string, number>;
    now: Date;
    // in sessione, sugli snapshot riletti nell'ordine dei posti; un errore abortisce la transazione
    outcomesOf(
        snapshots: readonly ResolutionCharacter[],
    ): ReadonlyMap<string, GmSeatOutcome>;
    // scritture in più nella stessa transazione, dopo i posti e la quest
    afterSeats?(session: ClientSession): Promise<void>;
}

interface GmCommit {
    outcome: CommittedOutcome;
    drafts: QuestResultDraft[];
}

const spellIdsOf = (
    overrides: readonly ParticipantOverrideInput[] | null | undefined,
): Types.ObjectId[] =>
    (overrides ?? []).flatMap(({ spellsUsed }) =>
        (spellsUsed ?? []).flatMap(({ spell }) => objectIdFromHex(spell) ?? []),
    );

// D-03/D-04: solo esito positivo, nessun reject né rimborso; una chiamata chiude la worldMission per tutti i registrati, un risultato ciascuno
@Injectable()
export class GmCompletionService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        private readonly requests: GmRequestReader,
        private readonly loader: ResolutionLoader,
        private readonly writer: OutcomeWriter,
        private readonly chance: ChanceSource,
        private readonly clock: Clock,
        @InjectModel(MissionDraft.name)
        private readonly draftModel: Model<MissionDraft>,
    ) {}

    // i risultati committati tornano dalle bozze scritte in transazione: la risposta non dipende da una rilettura (WR-03)
    async complete(
        input: CompletePendingRequestInput,
    ): Promise<QuestResultDraft[]> {
        const request = await this.requests.read(input.pendingQuestId);
        assertNoBusyParticipant(
            request.seats.map(({ character }) => character),
        );
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
        return this.completeWith({
            request,
            recoveryTimes,
            petMaxXp: catalog.petMaxXp,
            now: this.clock.now(),
            outcomesOf: (snapshots) => {
                const battles = validateOverrides(
                    input.outcomes,
                    snapshots.map(overrideParticipantOf),
                );
                // un tiro dei premi per posto, nell'ordine dei posti: le spec a seme fisso pinnano la sequenza
                return new Map(
                    snapshots.map((snapshot) => [
                        snapshot._id.toHexString(),
                        {
                            battle:
                                battles.get(snapshot._id.toHexString()) ?? null,
                            enemies: enemyFactsOf(catalog),
                            // gmCompleted con nemici insegna come un success (Phase 16 D-06, C-1): stesso predicato dell'xp dei nemici
                            victory: victoryKnowledgeOf(catalog),
                            // il blocco del titolo del partecipante letto in sessione (D-04, D-18)
                            rewards: drawRewards(
                                prizeBlockFor(
                                    request.quest,
                                    snapshot.status.title,
                                ),
                                catalog.rewards,
                                this.chance,
                            ),
                        },
                    ]),
                );
            },
            // D-25: il vecchio completamento convive e chiude la bozza
            afterSeats: (session) =>
                this.draftModel
                    .deleteMany(
                        {
                            'participants.pendingQuest': {
                                $in: request.seats.map(
                                    ({ pendingQuestId }) => pendingQuestId,
                                ),
                            },
                        },
                        { session },
                    )
                    .exec()
                    .then(() => undefined),
        });
    }

    // commit, errore del perdente e consegna condivisi dai completamenti del GM (D-08)
    async completeWith(plan: GmCommitPlan): Promise<QuestResultDraft[]> {
        const committed = await this.commit(plan);
        if (!committed)
            throw await this.requests.lostCompletionError(plan.request);
        await this.writer.deliver(committed.outcome);
        return committed.drafts;
    }

    // una transazione per l'intera richiesta (D-21): esiti calcolati sugli snapshot in sessione, un errore tipizzato abortisce
    private async commit(plan: GmCommitPlan): Promise<GmCommit | null> {
        const { quest, lane, seats } = plan.request;
        const state: { committed: GmCommit | null } = {
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
                assertNoBusyParticipant(snapshots);
                const outcomes = plan.outcomesOf(snapshots);
                const committed = emptyCommitted();
                const drafts: QuestResultDraft[] = [];
                const verdicts: Parameters<
                    typeof questUpdateOf
                >[0]['verdicts'] = [];
                for (const [index, seat] of seats.entries()) {
                    const snapshot = snapshots[index];
                    const outcome = outcomes.get(snapshot._id.toHexString());
                    // un posto senza esito non si scrive a metà: l'intera richiesta si rifiuta
                    if (!outcome)
                        throw GameRuleException.outcomeOverrideInvalid();
                    const participant = planParticipant({
                        resultId: seat.resultId,
                        snapshot,
                        quest,
                        lane,
                        pendingQuestId: seat.pendingQuestId,
                        userId: seat.ownerId,
                        verdict: QuestOutcome.gmCompleted,
                        battle: outcome.battle,
                        enemies: outcome.enemies,
                        victory: outcome.victory,
                        rewards: outcome.rewards,
                        aid: null,
                        spellRecoveryTimes: plan.recoveryTimes,
                        petMaxXp: plan.petMaxXp,
                        now: plan.now,
                    });
                    await this.writer.writeParticipant(participant, session);
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
                    committed.spellRecoveries.push(
                        ...participant.spellRecoveries,
                    );
                    drafts.push(participant.result);
                }
                // la worldMission sparisce per tutti (D-06); la story non è registrata e non ha nulla da aggiornare
                await this.writer.updateQuest(
                    { _id: quest._id },
                    questUpdateOf({
                        type: quest.infos.type,
                        verdicts,
                        now: plan.now,
                    }),
                    session,
                    'bestEffort',
                );
                await plan.afterSeats?.(session);
                state.committed = { outcome: committed, drafts };
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            return null;
        }
        return state.committed;
    }
}
