import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { QuestConfig } from 'src/config/quest-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { refIdOf } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { QuestStartService } from 'src/quests/party/quest-start.service';
import { QuestResolutionService } from './quest-resolution.service';
import { RescueResolutionService } from './rescue-resolution.service';
import {
    ArrivedUnstartedQuest,
    arrivedUnstartedPipeline,
    DUE_AID_TIMEOUT_PROJECTION,
    DueStandardQuest,
    dueAidTimeoutsFilter,
    dueStandardQuestsPipeline,
} from './scheduling/quest-resolution.updates';

export interface QuestSweepCounts {
    resolved: number;
    timedOut: number;
}

interface DueAidTimeout {
    _id: Types.ObjectId;
    status: { awaitingAid?: { aidQuest?: unknown } | null };
}

// i feriti dello stesso combattimento condividono la aid: un solo timeout per aid, non uno per ferito
function distinctAidsOf(due: readonly DueAidTimeout[]): Types.ObjectId[] {
    const aids = new Map<string, Types.ObjectId>();
    for (const character of due) {
        const aidQuestId = refIdOf(character.status.awaitingAid?.aidQuest);
        if (aidQuestId) aids.set(aidQuestId.toHexString(), aidQuestId);
    }
    return [...aids.values()];
}

@Injectable()
export class QuestResolutionSweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger(QuestResolutionSweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<QuestSweepCounts> | null = null;
    private stopping = false;

    constructor(
        @Inject(QUEST_CONFIG) private readonly config: QuestConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly resolution: QuestResolutionService,
        private readonly rescue: RescueResolutionService,
        private readonly questStart: QuestStartService,
        private readonly clock: Clock,
    ) {}

    // il DB decide (STATE [Phase 8]): reconciler sempre al boot, mai atteso; 0 spegne solo lo sweep periodico (D-24)
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => void this.sweepSafely(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        void this.sweepSafely();
    }

    // lo sweep in corso finisce prima che Mongoose e le code chiudano; nessuna nuova risoluzione dopo lo stop
    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.inFlight?.catch(() => undefined);
    }

    // single-flight: un tick saltato è recuperato dal successivo; copre i job persi per eviction Redis (blocker STATE)
    sweep(): Promise<QuestSweepCounts> {
        this.inFlight ??= this.runOnce().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async runOnce(): Promise<QuestSweepCounts> {
        const now = this.clock.now();
        const started = await this.startPendingQuests();
        const resolved = await this.resolveDueQuests(now);
        const timedOut = await this.timeOutDueAids(now);
        if (started + resolved + timedOut > 0) {
            this.logger.log(
                `Sweep delle missioni: ${started} avviate, ${resolved} risolte, ${timedOut} soccorsi scaduti`,
            );
        }
        return { resolved, timedOut };
    }

    // avvii mancati (utente 2026-10-25): un solo tryStart per quest, il party parte tutto insieme
    private async startPendingQuests(): Promise<number> {
        const arrived = await this.characterModel
            .aggregate<ArrivedUnstartedQuest>(arrivedUnstartedPipeline())
            .exec();
        const seen = new Set<string>();
        let started = 0;
        for (const { questId: ref, pendingQuestId } of arrived) {
            if (this.stopping) break;
            const questId = refIdOf(ref);
            if (!questId || seen.has(questId.toHexString())) continue;
            seen.add(questId.toHexString());
            try {
                const outcome = await this.questStart.tryStart({
                    questId,
                    pendingQuestId,
                });
                if (outcome === 'started') started++;
            } catch (error) {
                this.logger.error(
                    `Avvio della missione ${questId.toHexString()} fallito: ${describeError(error)}`,
                );
            }
        }
        return started;
    }

    // solo la corsia standard (Pitfall 2): story e worldMission restano al GM
    private async resolveDueQuests(now: Date): Promise<number> {
        const due = await this.characterModel
            .aggregate<DueStandardQuest>(dueStandardQuestsPipeline(now))
            .exec();
        let resolved = 0;
        // in serie: ogni risoluzione è una transazione sullo stesso pool, nessun picco al boot
        for (const { pendingQuestId, startDate } of due) {
            if (this.stopping) break;
            try {
                const outcome = await this.resolution.resolveStandard({
                    pendingQuestId,
                    startDate,
                });
                if (outcome === 'resolved') resolved++;
            } catch (error) {
                this.logger.error(
                    `Risoluzione della missione in attesa ${pendingQuestId.toHexString()} fallita: ${describeError(error)}`,
                );
            }
        }
        return resolved;
    }

    // 7 giorni senza soccorso (D-10): stessa funzione del job aid-timeout
    private async timeOutDueAids(now: Date): Promise<number> {
        if (this.stopping) return 0;
        const due = await this.characterModel
            .find(dueAidTimeoutsFilter(now), DUE_AID_TIMEOUT_PROJECTION)
            .lean<DueAidTimeout[]>()
            .exec();
        let timedOut = 0;
        for (const aidQuestId of distinctAidsOf(due)) {
            if (this.stopping) break;
            try {
                const outcome = await this.rescue.timeoutAid({ aidQuestId });
                if (outcome === 'resolved') timedOut++;
            } catch (error) {
                this.logger.error(
                    `Timeout del soccorso ${aidQuestId.toHexString()} fallito: ${describeError(error)}`,
                );
            }
        }
        return timedOut;
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            () => undefined,
            (error: unknown) =>
                this.logger.error(
                    `Sweep delle missioni fallito: ${describeError(error)}`,
                ),
        );
    }
}
