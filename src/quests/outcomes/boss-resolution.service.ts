import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import { buildAidQuest } from './aid/aid-quest';
import { ChanceSource } from './chance-source';
import { CombatResolver } from './combat/combat-resolver';
import { battleOf, combatContextOf, planCombatant } from './combatant-plan';
import { OUTCOME_CHARACTER_PROJECTION } from './outcome-plan';
import {
    type CommittedOutcome,
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';
import { questClaimFilter, questUpdateOf } from './quest-outcome-plan';
import {
    type LaneCharacter,
    type PendingQuestSnapshot,
    type ResolutionCatalog,
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionOutcome,
    type StandardLoad,
} from './resolution-loader.service';

interface GroupSeat {
    character: ResolutionCharacter;
    pendingQuestId: Types.ObjectId;
    ownerId: Types.ObjectId;
    resultId: Types.ObjectId;
    aidQuestId: Types.ObjectId;
}

interface GroupRoster {
    seats: GroupSeat[];
    dropped: Types.ObjectId[];
    waiting: boolean;
}

interface GroupResolution {
    loaded: StandardLoad;
    registeredCount: number;
    roster: GroupRoster;
    catalog: ResolutionCatalog;
    now: Date;
}

const STANDARD_LANE_PATH = lanePathOf(QuestLane.standard);

const isDue = (pendingQuest: PendingQuestSnapshot, now: Date): boolean =>
    pendingQuest.startDate !== null &&
    pendingQuest.startDate.getTime() + (pendingQuest.waitingTime ?? 0) <=
        now.getTime();

// boss di gruppo (D-05 emendata, A3): si risolve una volta sola quando tutti i registrati hanno finito il countdown, un verdetto per il gruppo, effetti per partecipante
@Injectable()
export class BossResolutionService {
    private readonly logger = new Logger(BossResolutionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
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
        const roster = await this.readRoster(loaded, registered, now);
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

    // pre-letture lean: registrati attivi in corsia con una PendingQuest di questo boss; chi non ce l'ha (o non ha utente) esce (Pitfall 8)
    private async readRoster(
        loaded: StandardLoad,
        registered: readonly Types.ObjectId[],
        now: Date,
    ): Promise<GroupRoster> {
        const characters = await this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    _id: { $in: registered.flatMap((id) => idForms(id)) },
                    [STANDARD_LANE_PATH]: { $ne: null },
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<LaneCharacter<QuestLane.standard>[]>()
            .exec();
        const lanes = characters.flatMap(
            (character) => refIdOf(character.quests?.pendingQuest) ?? [],
        );
        const pendingQuests = await this.pendingQuestModel
            .find(
                {
                    _id: { $in: lanes },
                    quest: { $in: idForms(loaded.quest._id) },
                },
                { startDate: 1, waitingTime: 1, quest: 1 },
            )
            .lean<PendingQuestSnapshot[]>()
            .exec();
        const owners = await this.loader.ownersOf(
            characters.map(({ _id }) => _id),
        );
        const seats: GroupSeat[] = [];
        let waiting = false;
        for (const character of characters) {
            const lane = refIdOf(character.quests?.pendingQuest);
            const pendingQuest = pendingQuests.find(
                ({ _id }) => lane !== null && _id.equals(lane),
            );
            const ownerId = owners.get(character._id.toHexString());
            if (!pendingQuest || !ownerId) continue;
            if (!isDue(pendingQuest, now)) waiting = true;
            seats.push({
                character,
                pendingQuestId: pendingQuest._id,
                ownerId,
                resultId: new Types.ObjectId(),
                aidQuestId: new Types.ObjectId(),
            });
        }
        const dropped = registered.filter(
            (id) => !seats.some(({ character }) => character._id.equals(id)),
        );
        return { seats, dropped, waiting };
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
                const failed: GroupSeat[] = [];
                for (const [index, seat] of roster.seats.entries()) {
                    const snapshot = snapshots[index];
                    const { plan, verdict, aid } = planCombatant({
                        quest,
                        catalog,
                        snapshot,
                        battle: battleOf(resolution, snapshot._id),
                        resultId: seat.resultId,
                        aidQuestId: seat.aidQuestId,
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
                    if (aid) failed.push(seat);
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
                for (const seat of failed) {
                    // transitorio: 09-18 Task 2
                    await this.writer.createAid(
                        buildAidQuest(
                            quest,
                            [seat.character._id],
                            seat.aidQuestId,
                        ),
                        session,
                    );
                    committed.aids.push({
                        aidQuestId: seat.aidQuestId,
                        since: now,
                    });
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
