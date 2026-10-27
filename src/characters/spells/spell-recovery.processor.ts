import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Clock } from 'src/auth/clock';
import {
    SpellRecoveryJobData,
    spellRecoveryJobDataOf,
    spellRecoveryJobId,
} from './spell-recovery-job';
import {
    RECOVER_SPELL_JOB,
    SPELL_RECOVERY_QUEUE,
} from './spell-recovery-queue';
import { SpellRecoveryService } from './spell-recovery.service';
import { Sleeper } from './sleeper';

// Bull calcola il ritardo sull'orologio di Redis: entro questo anticipo è skew, oltre il job non viene da dueAt e resta allo sweep
export const EARLY_RECOVERY_TOLERANCE_MS = 5_000;

@Processor(SPELL_RECOVERY_QUEUE)
export class SpellRecoveryProcessor {
    private readonly logger = new Logger(SpellRecoveryProcessor.name);

    constructor(
        private readonly recovery: SpellRecoveryService,
        private readonly clock: Clock,
        private readonly sleeper: Sleeper,
    ) {}

    // il job è solo un trigger (D-06, STATE [Phase 8]): dati validati, mai prima di dueAt, mai ri-accodato; il DB decide quanti usi tornano
    @Process(RECOVER_SPELL_JOB)
    async recover(job: Job<SpellRecoveryJobData>): Promise<void> {
        const trigger = spellRecoveryJobDataOf(job.data);
        if (!trigger) {
            this.logger.warn(
                `Job di recupero ${String(job.id)} malformato: ignorato`,
            );
            return;
        }
        if (!trigger.dueAt) {
            await this.recovery.recoverLegacy(
                trigger.characterId,
                trigger.spellId,
            );
            return;
        }
        const earlyByMs = trigger.dueAt.getTime() - this.clock.now().getTime();
        if (earlyByMs > EARLY_RECOVERY_TOLERANCE_MS) {
            this.logger.log(
                `Job di recupero ${spellRecoveryJobId(trigger.characterId, trigger.spellId, trigger.dueAt)} in anticipo: lo restituirà lo sweep`,
            );
            return;
        }
        if (earlyByMs > 0) await this.sleeper.sleep(earlyByMs);
        await this.recovery.recoverDue(trigger.characterId, trigger.spellId);
    }
}
