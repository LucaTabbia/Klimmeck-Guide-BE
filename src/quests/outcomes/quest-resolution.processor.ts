import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Clock } from 'src/auth/clock';
import { partyTimeoutDueAt } from 'src/quests/party/party-rules';
import { PartyTimeoutService } from 'src/quests/party/party-timeout.service';
import { aidTimeoutDueAt } from './aid/aid-timeout';
import { QuestResolutionService } from './quest-resolution.service';
import { RescueResolutionService } from './rescue-resolution.service';
import {
    AID_TIMEOUT_JOB,
    AidTimeoutJobData,
    aidTimeoutJobDataOf,
    aidTimeoutJobId,
    PARTY_TIMEOUT_JOB,
    PartyTimeoutJobData,
    partyTimeoutJobDataOf,
    partyTimeoutJobId,
    QUEST_RESOLUTION_QUEUE,
    questResolutionJobId,
    RESOLVE_QUEST_JOB,
    ResolveQuestJobData,
    resolutionDueAt,
    resolveQuestJobDataOf,
} from './scheduling/quest-resolution-job';

// il job è solo un trigger (D-24): dati validati, mai prima della scadenza, mai ri-accodato (C10 Phase 8)
@Processor(QUEST_RESOLUTION_QUEUE)
export class QuestResolutionProcessor {
    private readonly logger = new Logger(QuestResolutionProcessor.name);

    constructor(
        private readonly resolution: QuestResolutionService,
        private readonly rescue: RescueResolutionService,
        private readonly partyTimeout: PartyTimeoutService,
        private readonly clock: Clock,
    ) {}

    @Process(RESOLVE_QUEST_JOB)
    async resolve(job: Job<ResolveQuestJobData>): Promise<void> {
        const trigger = resolveQuestJobDataOf(job.data);
        if (!trigger) {
            this.warnMalformed('di risoluzione', job);
            return;
        }
        const jobId = questResolutionJobId(
            trigger.pendingQuestId,
            trigger.startDate,
        );
        if (this.isEarly(resolutionDueAt(trigger), 'di risoluzione', jobId)) {
            return;
        }
        await this.resolution.resolveStandard({
            pendingQuestId: trigger.pendingQuestId,
            startDate: trigger.startDate,
        });
    }

    @Process(AID_TIMEOUT_JOB)
    async aidTimeout(job: Job<AidTimeoutJobData>): Promise<void> {
        const trigger = aidTimeoutJobDataOf(job.data);
        if (!trigger) {
            this.warnMalformed('di timeout del soccorso', job);
            return;
        }
        const jobId = aidTimeoutJobId(trigger.aidQuestId);
        if (
            this.isEarly(
                aidTimeoutDueAt(trigger.since),
                'di timeout del soccorso',
                jobId,
            )
        ) {
            return;
        }
        await this.rescue.timeoutAid({ aidQuestId: trigger.aidQuestId });
    }

    // 24 ore senza posti pieni (utente 2026-10-25): il servizio rilegge il party e decide
    @Process(PARTY_TIMEOUT_JOB)
    async partyTimeoutJob(job: Job<PartyTimeoutJobData>): Promise<void> {
        const trigger = partyTimeoutJobDataOf(job.data);
        if (!trigger) {
            this.warnMalformed('di timeout del party', job);
            return;
        }
        const jobId = partyTimeoutJobId(trigger.questId, trigger.since);
        if (
            this.isEarly(
                partyTimeoutDueAt(trigger.since),
                'di timeout del party',
                jobId,
            )
        ) {
            return;
        }
        await this.partyTimeout.disband({ questId: trigger.questId });
    }

    private warnMalformed(subject: string, job: Job): void {
        this.logger.warn(
            `Job ${subject} ${String(job.id)} malformato: ignorato`,
        );
    }

    // un job anticipato (skew dell'orologio) non scrive né si ri-accoda: lo sweep lo recupera
    private isEarly(dueAt: Date, subject: string, jobId: string): boolean {
        if (dueAt.getTime() <= this.clock.now().getTime()) return false;
        this.logger.log(
            `Job ${subject} ${jobId} in anticipo: lo risolverà lo sweep`,
        );
        return true;
    }
}
