import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import type { SpellRecoveryJobData } from './spell-recovery-job';
import {
    RECOVER_SPELL_JOB,
    SPELL_RECOVERY_QUEUE,
} from './spell-recovery-queue';

@Processor(SPELL_RECOVERY_QUEUE)
export class SpellRecoveryProcessor {
    @Process(RECOVER_SPELL_JOB)
    recover(job: Job<SpellRecoveryJobData>): Promise<void> {
        void job;
        return Promise.resolve();
    }
}
