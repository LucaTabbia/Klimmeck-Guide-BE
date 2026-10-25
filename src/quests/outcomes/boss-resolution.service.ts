import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { refIdOf } from 'src/mongo/document-id';
import { buildAidQuest } from './aid/aid-quest';
import { ChanceSource } from './chance-source';
import { CombatResolver } from './combat/combat-resolver';
import { battleOf, combatContextOf, planCombatant } from './combatant-plan';
import type { GroupRoster, GroupSeat } from './group-roster';
import {
    type CommittedOutcome,
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';
import { questClaimFilter, questUpdateOf } from './quest-outcome-plan';
import {
    type ResolutionCatalog,
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionOutcome,
    type StandardLoad,
} from './resolution-loader.service';

interface GroupResolution {
    loaded: StandardLoad;
    registeredCount: number;
    roster: GroupRoster;
    catalog: ResolutionCatalog;
    now: Date;
}

// boss di gruppo (D-05 emendata, A3): si risolve una volta sola quando tutti i registrati hanno finito il countdown, un verdetto per il gruppo, effetti per partecipante
@Injectable()
export class BossResolutionService {
    private readonly logger = new Logger(BossResolutionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        private readonly loader: ResolutionLoader,
        private readonly writer: OutcomeWriter,
        private readonly combat: CombatResolver,
        private readonly chance: ChanceSource,
    ) {}

    async resolveGroup(
        loaded: StandardLoad,
        now: Date,
    ): Promise<ResolutionOutcome> {
        const questId = loaded.quest._id.toHexString();
        const registered = (loaded.quest.registeredAdventurers ?? []).flatMap(
            (seat) => refIdOf(seat.character) ?? [],
        );
        const roster = await this.loader.readGroupRoster(
            loaded.quest._id,
            registered,
            now,
        );
        if (roster.waiting) {
            this.logger.log(
                `Boss ${questId}: non tutti i registrati hanno finito il countdown, si attende`,
            );
            return 'waiting';
        }
        if (roster.seats.length === 0) return 'stale';
        const catalog = await this.loader.readCatalog(
            loaded.quest,
            roster.seats.map(({ character }) => character),
        );
        const committed = await this.commitGroup({
            loaded,
            registeredCount: (loaded.quest.registeredAdventurers ?? []).length,
            roster,
            catalog,
            now,
        });
        if (!committed) {
            this.logger.log(
                `Boss ${questId} già risolto o cambiato: nessuna scrittura`,
            );
            return 'stale';
        }
        for (const characterId of roster.dropped) {
            this.logger.warn(
                `Registrato ${characterId.toHexString()} della missione ${questId} senza missione in attesa coerente: rimosso`,
            );
        }
        await this.writer.deliver(committed);
        this.logger.log(
            `Boss ${questId} risolto per ${roster.seats.length} partecipanti`,
        );
        return 'resolved';
    }

    // una sola transazione per tutto il gruppo (D-21): una caduta a metà non lascia un gruppo risolto a metà
    private async commitGroup({
        loaded,
        registeredCount,
        roster,
        catalog,
        now,
    }: GroupResolution): Promise<CommittedOutcome | null> {
        const { quest } = loaded;
        // transitorio: 09-18 Task 2
        const aidQuestIds = roster.seats.map(() => new Types.ObjectId());
        const state: { committed: CommittedOutcome | null } = {
            committed: null,
        };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                state.committed = null;
                const snapshots: ResolutionCharacter[] = [];
                for (const seat of roster.seats) {
                    snapshots.push(
                        await this.loader.snapshotInSession(
                            seat.character._id,
                            seat.pendingQuestId,
                            session,
                        ),
                    );
                }
                const context = combatContextOf(quest, catalog, snapshots);
                const resolution = context
                    ? this.combat.resolve(context, this.chance)
                    : null;
                const committed = emptyCommitted();
                const verdicts: Parameters<
                    typeof questUpdateOf
                >[0]['verdicts'] = [];
                const failed: {
                    seat: GroupSeat;
                    aidQuestId: Types.ObjectId;
                }[] = [];
                for (const [index, seat] of roster.seats.entries()) {
                    const snapshot = snapshots[index];
                    const { plan, verdict, aid } = planCombatant({
                        quest,
                        catalog,
                        snapshot,
                        battle: battleOf(resolution, snapshot._id),
                        resultId: seat.resultId,
                        aidQuestId: aidQuestIds[index],
                        pendingQuestId: seat.pendingQuestId,
                        userId: seat.ownerId,
                        chance: this.chance,
                        now,
                    });
                    await this.writer.writeParticipant(plan, session);
                    await this.writer.deletePendingQuest(
                        seat.pendingQuestId,
                        session,
                    );
                    verdicts.push({ characterId: snapshot._id, verdict });
                    committed.results.push({
                        resultId: seat.resultId,
                        userId: seat.ownerId,
                    });
                    committed.spellRecoveries.push(...plan.spellRecoveries);
                    if (aid)
                        failed.push({ seat, aidQuestId: aidQuestIds[index] });
                }
                // claim del gruppo (D-05, D-21): un secondo trigger o un nuovo iscritto ⇒ WriteConflict o 0 match ⇒ no-op, lo sweep riprova
                await this.writer.updateQuest(
                    {
                        ...questClaimFilter(
                            quest._id,
                            roster.seats.map(({ character }) => character._id),
                        ),
                        registeredAdventurers: { $size: registeredCount },
                    },
                    questUpdateOf({
                        type: quest.infos.type,
                        verdicts,
                        dropped: roster.dropped,
                        now,
                    }),
                    session,
                    'claim',
                );
                for (const { seat, aidQuestId } of failed) {
                    // transitorio: 09-18 Task 2
                    await this.writer.createAid(
                        buildAidQuest(quest, [seat.character._id], aidQuestId),
                        session,
                    );
                    committed.aids.push({ aidQuestId, since: now });
                }
                state.committed = committed;
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            return null;
        }
        return state.committed;
    }
}
