import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Clock } from 'src/auth/clock';
import { TravelCompletionService } from './travel-completion.service';
import {
    TRAVEL_COMPLETE_JOB,
    TRAVEL_QUEUE,
    TravelJobData,
    travelJobDataOf,
    travelJobId,
} from './travel-job';

@Processor(TRAVEL_QUEUE)
export class TravelCompletionProcessor {
    private readonly logger = new Logger(TravelCompletionProcessor.name);

    constructor(
        private readonly completion: TravelCompletionService,
        private readonly clock: Clock,
    ) {}

    // il job è solo un trigger (STATE [Phase 8]): dati validati, mai prima di endTime, mai ri-accodato (C10)
    @Process(TRAVEL_COMPLETE_JOB)
    async handle(job: Job<TravelJobData>): Promise<void> {
        const identity = travelJobDataOf(job.data);
        if (!identity) {
            this.logger.warn(
                `Job di viaggio ${String(job.id)} malformato: ignorato`,
            );
            return;
        }
        if (identity.endTime.getTime() > this.clock.now().getTime()) {
            this.logger.log(
                `Job di viaggio ${travelJobId(identity.characterId, identity.startTime)} in anticipo: lo completerà lo sweep`,
            );
            return;
        }
        await this.completion.complete(identity);
    }
}
