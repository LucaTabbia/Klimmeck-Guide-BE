import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { buildAidQuest } from './aid/aid-quest';
import { BossResolutionService } from './boss-resolution.service';
import { ChanceSource } from './chance-source';
import { CombatResolver } from './combat/combat-resolver';
import {
    battleOf,
    type CombatantBattle,
    combatContextOf,
    planCombatant,
} from './combatant-plan';
import {
    type CommittedOutcome,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';
import { questUpdateOf } from './quest-outcome-plan';
import {
    type ResolutionCatalog,
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionOutcome,
    type StandardLoad,
    type StandardTrigger,
} from './resolution-loader.service';
import { resolutionKindOf } from './resolution-kind';
import { RescueResolutionService } from './rescue-resolution.service';

export type { ResolutionOutcome, StandardTrigger };

// il DB è la fonte di verità (D-01): il trigger è solo un invito a rileggere lo stato, mai un ordine
@Injectable()
export class QuestResolutionService {
    private readonly logger = new Logger(QuestResolutionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        private readonly loader: ResolutionLoader,
        private readonly boss: BossResolutionService,
        private readonly rescue: RescueResolutionService,
        private readonly writer: OutcomeWriter,
        private readonly combat: CombatResolver,
        private readonly chance: ChanceSource,
        private readonly clock: Clock,
    ) {}

    // unico ingresso dei trigger della corsia standard: smista su individuale, gruppo boss o soccorso (D-01, D-05, D-09)
    async resolveStandard(
        trigger: StandardTrigger,
    ): Promise<ResolutionOutcome> {
        const now = this.clock.now();
        const loaded = await this.load(trigger, now);
        if (typeof loaded === 'string') return loaded;
        switch (resolutionKindOf(loaded.quest)) {
            case 'group':
                return this.boss.resolveGroup(loaded, now);
            case 'rescue':
                return this.rescue.resolveRescue(loaded, now);
            case 'individual':
                return this.resolveLoadedIndividual(loaded, now);
        }
    }

    private async load(
        trigger: StandardTrigger,
        now: Date,
    ): Promise<StandardLoad | 'stale' | 'waiting'> {
        const loaded = await this.loader.loadStandardTrigger(trigger, now);
        if (loaded === 'stale' || loaded === 'waiting') {
            this.logger.log(
                `Missione in attesa ${trigger.pendingQuestId.toHexString()}: ${loaded === 'stale' ? 'trigger obsoleto' : 'non ancora scaduta'}, nessuna scrittura`,
            );
        }
        return loaded;
    }

    // individuale: enemy, hunt, dungeon e aid senza soccorso
    private async resolveLoadedIndividual(
        loaded: StandardLoad,
        now: Date,
    ): Promise<ResolutionOutcome> {
        const pendingQuestId = loaded.pendingQuest._id;
        const catalog = await this.loader.readCatalog(loaded.quest, [
            loaded.character,
        ]);
        const resultId = new Types.ObjectId();
        const aidQuestId = new Types.ObjectId();
        const outcome: {
            committed: CommittedOutcome | null;
            verdict: QuestOutcome | null;
        } = { committed: null, verdict: null };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                outcome.committed = null;
                outcome.verdict = null;
                const snapshot = await this.loader.snapshotInSession(
                    loaded.character._id,
                    pendingQuestId,
                    session,
                );
                const { plan, verdict, aid } = planCombatant({
                    quest: loaded.quest,
                    catalog,
                    snapshot,
                    battle: this.fight(loaded, catalog, snapshot),
                    resultId,
                    aidQuestId,
                    pendingQuestId,
                    userId: loaded.ownerId,
                    chance: this.chance,
                    now,
                });
                await this.writer.writeParticipant(plan, session);
                await this.writer.deletePendingQuest(pendingQuestId, session);
                await this.writer.updateQuest(
                    { _id: loaded.quest._id },
                    questUpdateOf({
                        type: loaded.quest.infos.type,
                        verdicts: [{ characterId: snapshot._id, verdict }],
                        now,
                    }),
                    session,
                    'bestEffort',
                );
                if (aid) {
                    await this.writer.createAid(
                        buildAidQuest(loaded.quest, snapshot._id, aidQuestId),
                        session,
                    );
                }
                outcome.verdict = verdict;
                outcome.committed = {
                    results: [{ resultId, userId: loaded.ownerId }],
                    aids: aid ? [{ aidQuestId, since: now }] : [],
                    spellRecoveries: plan.spellRecoveries,
                };
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            this.logger.log(
                `Missione in attesa ${pendingQuestId.toHexString()} già risolta o cambiata: nessuna scrittura`,
            );
            return 'stale';
        }
        if (!outcome.committed) return 'stale';
        await this.writer.deliver(outcome.committed);
        this.logger.log(
            `Missione in attesa ${pendingQuestId.toHexString()} risolta: ${outcome.verdict}`,
        );
        return 'resolved';
    }

    // il combattimento passa solo dalla porta (D-02)
    private fight(
        loaded: StandardLoad,
        catalog: ResolutionCatalog,
        snapshot: ResolutionCharacter,
    ): CombatantBattle | null {
        const context = combatContextOf(loaded.quest, catalog, [snapshot]);
        if (!context) return null;
        return battleOf(
            this.combat.resolve(context, this.chance),
            snapshot._id,
        );
    }
}
