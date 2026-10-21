import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Clock } from 'src/auth/clock';
import { TravelCompletionService } from './travel-completion.service';
import { TRAVEL_COMPLETE_JOB, TRAVEL_QUEUE, TravelJobData } from './travel-job';

@Processor(TRAVEL_QUEUE)
export class TravelCompletionProcessor {
    private readonly logger = new Logger(TravelCompletionProcessor.name);

    constructor(
        private readonly completion: TravelCompletionService,
        private readonly clock: Clock,
    ) {}

    @Process(TRAVEL_COMPLETE_JOB)
    handle(job: Job<TravelJobData>): Promise<void> {
        void job;
        return Promise.resolve();
    }
}
