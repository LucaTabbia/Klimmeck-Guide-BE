import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Clock } from 'src/auth/clock';
import { TRAVEL_QUEUE } from '../travel-job';
import {
    AMBUSH_JOB,
    AmbushJobData,
    ambushJobDataOf,
    ambushJobId,
} from './ambush-job';
import { AmbushResolutionService } from './ambush-resolution.service';

// secondo nome sulla coda travel, pattern di quest-resolution.processor (tre nomi sulla stessa coda)
@Processor(TRAVEL_QUEUE)
export class AmbushProcessor {
    private readonly logger = new Logger(AmbushProcessor.name);

    constructor(
        private readonly resolution: AmbushResolutionService,
        private readonly clock: Clock,
    ) {}

    // il job è solo un trigger (D-05): dati validati, mai prima di at; doppioni e obsoleti li scarta il filtro d'identità
    @Process(AMBUSH_JOB)
    async handle(job: Job<AmbushJobData>): Promise<void> {
        const identity = ambushJobDataOf(job.data);
        if (!identity) {
            this.logger.warn(
                `Job d'imboscata ${String(job.id)} malformato: ignorato`,
            );
            return;
        }
        if (identity.at.getTime() > this.clock.now().getTime()) {
            this.logger.log(
                `Job ${ambushJobId(identity.characterId, identity.startTime, identity.at)} in anticipo: lo risolverà lo sweep`,
            );
            return;
        }
        await this.resolution.resolve(identity);
    }
}
