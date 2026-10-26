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
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { refIdOf } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { isRegistered } from 'src/quests/acceptance/quest-eligibility';
import {
    isPartyExpired,
    partyFormingSinceOf,
} from 'src/quests/party/party-rules';
import { PartyTimeoutService } from 'src/quests/party/party-timeout.service';
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
    FORMING_PARTY_PROJECTION,
    FormingParty,
    formingPartiesFilter,
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

// tryStart avvia tutto il party di una quest registrata, ma solo la PendingQuest passata per hunt, dungeon, job, heal e study
function startKeyOf(
    questId: Types.ObjectId,
    pendingQuestId: Types.ObjectId,
    type: QuestType | null | undefined,
): string {
    return type && isRegistered(type)
        ? questId.toHexString()
        : pendingQuestId.toHexString();
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
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        private readonly resolution: QuestResolutionService,
        private readonly rescue: RescueResolutionService,
        private readonly questStart: QuestStartService,
        private readonly partyTimeout: PartyTimeoutService,
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
        const backfilled = await this.partyTimeout.backfillRegisteredAt(now);
        const started = await this.startPendingQuests();
        const disbanded = await this.disbandExpiredParties(now);
        const resolved = await this.resolveDueQuests(now);
        const timedOut = await this.timeOutDueAids(now);
        if (backfilled + started + disbanded + resolved + timedOut > 0) {
            this.logger.log(
                `Sweep delle missioni: ${backfilled} quest con registrazioni retrodatate, ${started} avviate, ${disbanded} party sciolti, ${resolved} risolte, ${timedOut} soccorsi scaduti`,
            );
        }
        return { resolved, timedOut };
    }

    // avvii mancati (utente 2026-10-25): un tryStart per party registrato (parte tutto insieme), uno per PendingQuest altrimenti
    private async startPendingQuests(): Promise<number> {
        const arrived = await this.characterModel
            .aggregate<ArrivedUnstartedQuest>(arrivedUnstartedPipeline())
            .exec();
        const seen = new Set<string>();
        let started = 0;
        for (const { questId: ref, pendingQuestId, type } of arrived) {
            if (this.stopping) break;
            const questId = refIdOf(ref);
            if (!questId) continue;
            const key = startKeyOf(questId, pendingQuestId, type);
            if (seen.has(key)) continue;
            seen.add(key);
            // tryStart non lancia: logga l'errore e risponde 'stale'
            const outcome = await this.questStart.tryStart({
                questId,
                pendingQuestId,
            });
            if (outcome === 'started') started++;
        }
        return started;
    }

    // 24 ore senza posti pieni (utente 2026-10-25): il job party-timeout può essere andato perso
    private async disbandExpiredParties(now: Date): Promise<number> {
        if (this.stopping) return 0;
        const forming = await this.questModel
            .find(formingPartiesFilter(), FORMING_PARTY_PROJECTION)
            .lean<FormingParty[]>()
            .exec();
        let disbanded = 0;
        for (const party of forming) {
            if (this.stopping) break;
            const since = partyFormingSinceOf(
                party.registeredAdventurers ?? [],
            );
            if (!since || !isPartyExpired(since, now)) continue;
            try {
                const outcome = await this.partyTimeout.disband({
                    questId: party._id,
                });
                if (outcome === 'disbanded') disbanded++;
            } catch (error) {
                this.logger.error(
                    `Scioglimento del party della missione ${party._id.toHexString()} fallito: ${describeError(error)}`,
                );
            }
        }
        return disbanded;
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
