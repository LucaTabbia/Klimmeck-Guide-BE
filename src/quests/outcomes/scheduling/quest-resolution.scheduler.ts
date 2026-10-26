import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { Clock } from 'src/auth/clock';
import { aidTimeoutDueAt } from 'src/quests/outcomes/aid/aid-timeout';
import { partyTimeoutDueAt } from 'src/quests/party/party-rules';
import { enqueueTrigger, TriggerContext } from 'src/queues/enqueue-trigger';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import {
    AID_TIMEOUT_JOB,
    AidTimeoutJobData,
    AidTimeoutTrigger,
    aidTimeoutJobId,
    PARTY_TIMEOUT_JOB,
    PartyTimeoutJobData,
    partyTimeoutJobId,
    PartyTimeoutTrigger,
    QUEST_RESOLUTION_QUEUE,
    questResolutionJobId,
    RESOLVE_QUEST_JOB,
    ResolveQuestJobData,
    resolutionDueAt,
    ResolutionTrigger,
} from './quest-resolution-job';

type QuestResolutionJobData =
    | ResolveQuestJobData
    | AidTimeoutJobData
    | PartyTimeoutJobData;

const SWEEP_FALLBACK = 'lo risolverà lo sweep';

// trigger idempotenti della risoluzione (D-01, D-24): il DB resta la fonte di verità, il processor rilegge lo stato
@Injectable()
export class QuestResolutionScheduler implements OnModuleInit {
    private readonly logger = new Logger(QuestResolutionScheduler.name);
    private redisWarned = false;

    constructor(
        @InjectQueue(QUEST_RESOLUTION_QUEUE)
        private readonly queue: Queue<QuestResolutionJobData>,
        private readonly clock: Clock,
        @Inject(QUEUE_CALL_TIMEOUT)
        private readonly timeoutMs: number,
    ) {}

    onModuleInit(): void {
        this.queue.on('error', (error: Error) => this.warnRedisOnce(error));
    }

    async scheduleResolution(trigger: ResolutionTrigger): Promise<void> {
        await enqueueTrigger(
            this.queue,
            {
                name: RESOLVE_QUEST_JOB,
                data: {
                    pendingQuestId: trigger.pendingQuestId.toHexString(),
                    startDate: trigger.startDate.getTime(),
                    waitingTime: trigger.waitingTime,
                },
                jobId: questResolutionJobId(
                    trigger.pendingQuestId,
                    trigger.startDate,
                ),
                dueAt: resolutionDueAt(trigger),
            },
            this.context('della risoluzione'),
        );
    }

    // 7 giorni dalla aid senza esito (D-10)
    async scheduleAidTimeout(trigger: AidTimeoutTrigger): Promise<void> {
        await enqueueTrigger(
            this.queue,
            {
                name: AID_TIMEOUT_JOB,
                data: {
                    aidQuestId: trigger.aidQuestId.toHexString(),
                    since: trigger.since.getTime(),
                },
                jobId: aidTimeoutJobId(trigger.aidQuestId),
                dueAt: aidTimeoutDueAt(trigger.since),
            },
            this.context('del timeout di soccorso'),
        );
    }

    // 24 ore dalla prima registrazione del party corrente (utente 2026-10-25)
    async schedulePartyTimeout(trigger: PartyTimeoutTrigger): Promise<void> {
        await enqueueTrigger(
            this.queue,
            {
                name: PARTY_TIMEOUT_JOB,
                data: {
                    questId: trigger.questId.toHexString(),
                    since: trigger.since.getTime(),
                },
                jobId: partyTimeoutJobId(trigger.questId, trigger.since),
                dueAt: partyTimeoutDueAt(trigger.since),
            },
            this.context('del timeout del party'),
        );
    }

    private context(subject: string): TriggerContext {
        return {
            clock: this.clock,
            timeoutMs: this.timeoutMs,
            logger: this.logger,
            subject,
            fallback: SWEEP_FALLBACK,
        };
    }

    // una sola volta per processo: senza dettagli di connessione (nessun host, porta o URL nel log)
    private warnRedisOnce(error: Error): void {
        if (this.redisWarned) return;
        this.redisWarned = true;
        const code =
            (error as NodeJS.ErrnoException)?.code ?? error?.name ?? 'unknown';
        this.logger.warn(
            `Redis non raggiungibile (${code}): i job delle missioni partiranno al riconnesso, lo sweep copre`,
        );
    }
}
