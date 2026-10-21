import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    TRAVEL_COMPLETE_JOB,
    TRAVEL_QUEUE,
    TravelJobData,
    travelJobId,
} from './travel-job';

@Injectable()
export class TravelScheduler {
    private readonly logger = new Logger(TravelScheduler.name);

    constructor(
        @InjectQueue(TRAVEL_QUEUE)
        private readonly queue: Queue<TravelJobData>,
        private readonly clock: Clock,
    ) {}

    // il job è solo un trigger (STATE [Phase 8]): se l'accodamento fallisce il viaggio resta valido e lo completa lo sweep (D-21), nessuna compensazione
    async schedule(
        characterId: Types.ObjectId,
        travel: { startTime: Date; endTime: Date },
    ): Promise<void> {
        const jobId = travelJobId(characterId, travel.startTime);
        try {
            await this.queue.add(
                TRAVEL_COMPLETE_JOB,
                {
                    characterId: characterId.toHexString(),
                    startTime: travel.startTime.getTime(),
                    endTime: travel.endTime.getTime(),
                },
                {
                    jobId,
                    delay: Math.max(
                        0,
                        travel.endTime.getTime() - this.clock.now().getTime(),
                    ),
                    removeOnComplete: true,
                    removeOnFail: false,
                },
            );
        } catch {
            this.logger.warn(
                `Accodamento del viaggio ${jobId} fallito: lo completerà lo sweep`,
            );
        }
    }

    // best-effort (D-16): un job attivo non si rimuove, ma al fire non trova più il viaggio (filtro d'identità, D-12)
    async cancel(characterId: Types.ObjectId, startTime: Date): Promise<void> {
        const jobId = travelJobId(characterId, startTime);
        try {
            const job = await this.queue.getJob(jobId);
            await job?.remove();
        } catch {
            this.logger.warn(
                `Rimozione del job ${jobId} non riuscita: il job si neutralizza da solo`,
            );
        }
    }
}
