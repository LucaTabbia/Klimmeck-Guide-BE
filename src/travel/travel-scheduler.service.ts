import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { enqueueTrigger } from 'src/queues/enqueue-trigger';
import {
    QUEUE_CALL_TIMED_OUT,
    QUEUE_CALL_TIMEOUT,
    withinTimeout,
} from 'src/queues/queue-call-timeout';
import { AMBUSH_JOB, AmbushJobData, ambushJobId } from './ambush/ambush-job';
import {
    TRAVEL_COMPLETE_JOB,
    TRAVEL_QUEUE,
    TravelJobData,
    travelJobId,
} from './travel-job';

@Injectable()
export class TravelScheduler implements OnModuleInit {
    private readonly logger = new Logger(TravelScheduler.name);
    private redisWarned = false;

    constructor(
        @InjectQueue(TRAVEL_QUEUE)
        private readonly queue: Queue<TravelJobData | AmbushJobData>,
        private readonly clock: Clock,
        @Inject(QUEUE_CALL_TIMEOUT)
        private readonly timeoutMs: number,
    ) {}

    onModuleInit(): void {
        this.queue.on('error', (error: Error) => this.warnRedisOnce(error));
    }

    // il job è solo un trigger (STATE [Phase 8]): se l'accodamento fallisce o non risponde entro il timeout (Redis irraggiungibile) la mutation risponde comunque, il viaggio resta valido e lo completa lo sweep (D-21), nessuna compensazione
    async schedule(
        characterId: Types.ObjectId,
        travel: { startTime: Date; endTime: Date },
    ): Promise<void> {
        await enqueueTrigger(
            this.queue,
            {
                name: TRAVEL_COMPLETE_JOB,
                data: {
                    characterId: characterId.toHexString(),
                    startTime: travel.startTime.getTime(),
                    endTime: travel.endTime.getTime(),
                },
                jobId: travelJobId(characterId, travel.startTime),
                dueAt: travel.endTime,
            },
            {
                clock: this.clock,
                timeoutMs: this.timeoutMs,
                logger: this.logger,
                subject: 'del viaggio',
                fallback: 'lo completerà lo sweep',
            },
        );
    }

    // best-effort (D-16): un job attivo o una coda che non risponde entro il timeout non bloccano, al fire il job non trova più il viaggio (filtro d'identità, D-12)
    async cancel(characterId: Types.ObjectId, startTime: Date): Promise<void> {
        await this.removeBestEffort(travelJobId(characterId, startTime));
    }

    // trigger dell'imboscata all'istante at (D-05): se manca la risolverà lo sweep
    async scheduleAmbush(
        characterId: Types.ObjectId,
        startTime: Date,
        at: Date,
    ): Promise<void> {
        await enqueueTrigger<TravelJobData | AmbushJobData>(
            this.queue,
            {
                name: AMBUSH_JOB,
                data: {
                    characterId: characterId.toHexString(),
                    startTime: startTime.getTime(),
                    at: at.getTime(),
                },
                jobId: ambushJobId(characterId, startTime, at),
                dueAt: at,
            },
            {
                clock: this.clock,
                timeoutMs: this.timeoutMs,
                logger: this.logger,
                subject: "dell'imboscata",
                fallback: 'la risolverà lo sweep',
            },
        );
    }

    // best-effort come cancel: al fire il job non trova più l'imboscata (filtro d'identità)
    async cancelAmbush(
        characterId: Types.ObjectId,
        startTime: Date,
        at: Date,
    ): Promise<void> {
        await this.removeBestEffort(ambushJobId(characterId, startTime, at));
    }

    private async removeBestEffort(jobId: string): Promise<void> {
        try {
            const outcome = await withinTimeout(
                this.removeJob(jobId),
                this.timeoutMs,
            );
            if (outcome === QUEUE_CALL_TIMED_OUT)
                this.logger.warn(
                    `Rimozione del job ${jobId} non confermata entro ${this.timeoutMs} ms: il job si neutralizza da solo`,
                );
        } catch {
            this.logger.warn(
                `Rimozione del job ${jobId} non riuscita: il job si neutralizza da solo`,
            );
        }
    }

    private async removeJob(jobId: string): Promise<void> {
        const job = await this.queue.getJob(jobId);
        await job?.remove();
    }

    // una sola volta per processo: senza dettagli di connessione (nessun host, porta o URL nel log)
    private warnRedisOnce(error: Error): void {
        if (this.redisWarned) return;
        this.redisWarned = true;
        const code =
            (error as NodeJS.ErrnoException)?.code ?? error?.name ?? 'unknown';
        this.logger.warn(
            `Redis non raggiungibile (${code}): i job di viaggio partiranno al riconnesso, lo sweep copre`,
        );
    }
}
