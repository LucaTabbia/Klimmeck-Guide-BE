import type { Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import type { Clock } from 'src/auth/clock';
import {
    QUEUE_CALL_TIMED_OUT,
    withinTimeout,
} from 'src/queues/queue-call-timeout';

export interface TriggerJob<T> {
    name: string;
    data: T;
    jobId: string;
    dueAt: Date;
}

// i falliti restano ispezionabili ma non si accumulano (D-17a); un job fallito con lo stesso jobId resta coperto dallo sweep
export const FAILED_JOBS_KEPT = { age: 7 * 24 * 3600, count: 1000 } as const;

// subject e fallback compongono il WARN: "Accodamento <subject> <jobId> fallito: <fallback>"
export interface TriggerContext {
    clock: Clock;
    timeoutMs: number;
    logger: Logger;
    subject: string;
    fallback: string;
}

// il job è solo un trigger (STATE [Phase 8]): accodamento best-effort con timeout, nessuna compensazione; lo sweep copre i mancati
export async function enqueueTrigger<T>(
    queue: Queue<T>,
    job: TriggerJob<T>,
    context: TriggerContext,
): Promise<void> {
    try {
        const outcome = await withinTimeout(
            queue.add(job.name, job.data, {
                jobId: job.jobId,
                delay: Math.max(
                    0,
                    job.dueAt.getTime() - context.clock.now().getTime(),
                ),
                removeOnComplete: true,
                removeOnFail: FAILED_JOBS_KEPT,
            }),
            context.timeoutMs,
        );
        if (outcome === QUEUE_CALL_TIMED_OUT)
            context.logger.warn(
                `Accodamento ${context.subject} ${job.jobId} non confermato entro ${context.timeoutMs} ms: ${context.fallback}`,
            );
    } catch {
        context.logger.warn(
            `Accodamento ${context.subject} ${job.jobId} fallito: ${context.fallback}`,
        );
    }
}
