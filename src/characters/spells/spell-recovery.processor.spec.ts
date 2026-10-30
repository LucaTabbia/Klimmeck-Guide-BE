import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { SpellRecoveryJobData, spellRecoveryJobId } from './spell-recovery-job';
import {
    EARLY_RECOVERY_TOLERANCE_MS,
    SpellRecoveryProcessor,
} from './spell-recovery.processor';
import { SpellRecoveryService } from './spell-recovery.service';
import { Sleeper } from './sleeper';

const NOW = new Date('2026-10-27T10:00:00.000Z');
const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
const MILLISECONDS_PER_SECOND = 1000;

// l'attesa finta fa avanzare l'orologio: nessun timer reale
class AdvancingSleeper extends Sleeper {
    readonly waits: number[] = [];

    constructor(private readonly clock: FixedClock) {
        super();
    }

    sleep(ms: number): Promise<void> {
        this.waits.push(ms);
        this.clock.advanceSeconds(ms / MILLISECONDS_PER_SECOND);
        return Promise.resolve();
    }
}

describe('SpellRecoveryProcessor', () => {
    const characterId = new Types.ObjectId();
    const spellId = new Types.ObjectId();
    let clock: FixedClock;
    let sleeper: AdvancingSleeper;
    let recoverDue: jest.Mock;
    let recoverLegacy: jest.Mock;
    let processor: SpellRecoveryProcessor;

    function jobDueAt(dueAt: Date): Job<SpellRecoveryJobData> {
        return {
            id: spellRecoveryJobId(characterId, spellId, dueAt),
            data: {
                characterId: characterId.toHexString(),
                spellId: spellId.toHexString(),
                dueAt: dueAt.getTime(),
            },
        } as Job<SpellRecoveryJobData>;
    }

    beforeEach(() => {
        clock = new FixedClock(NOW);
        sleeper = new AdvancingSleeper(clock);
        recoverDue = jest.fn().mockResolvedValue(1);
        recoverLegacy = jest.fn().mockResolvedValue(true);
        processor = new SpellRecoveryProcessor(
            { recoverDue, recoverLegacy } as unknown as SpellRecoveryService,
            clock,
            sleeper,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('credits a due job at once without waiting', async () => {
        await processor.recover(jobDueAt(new Date(NOW.getTime() - SECOND)));

        expect(sleeper.waits).toEqual([]);
        expect(recoverDue.mock.calls).toEqual([[characterId, spellId]]);
    });

    it('«Il timer di recupero non si interrompe mai»: a job fired a couple of seconds early by clock skew waits for its instant, then credits once', async () => {
        const dueAt = new Date(NOW.getTime() + 2 * SECOND);
        recoverDue.mockImplementation(() => {
            expect(clock.now().getTime()).toBeGreaterThanOrEqual(
                dueAt.getTime(),
            );
            return Promise.resolve(1);
        });

        await processor.recover(jobDueAt(dueAt));

        expect(sleeper.waits).toEqual([2 * SECOND]);
        expect(recoverDue.mock.calls).toEqual([[characterId, spellId]]);
    });

    it('waits for a job early by exactly the tolerance', async () => {
        await processor.recover(
            jobDueAt(new Date(NOW.getTime() + EARLY_RECOVERY_TOLERANCE_MS)),
        );

        expect(sleeper.waits).toEqual([EARLY_RECOVERY_TOLERANCE_MS]);
        expect(recoverDue).toHaveBeenCalledTimes(1);
    });

    it('leaves a job early by more than the tolerance to the sweep, without waiting or writing', async () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        const dueAt = new Date(NOW.getTime() + HOUR);

        await processor.recover(jobDueAt(dueAt));

        expect(sleeper.waits).toEqual([]);
        expect(recoverDue).not.toHaveBeenCalled();
        expect(log.mock.calls.map(([value]) => String(value))).toEqual([
            `Job di recupero ${spellRecoveryJobId(characterId, spellId, dueAt)} in anticipo: lo restituirà lo sweep`,
        ]);
    });

    it('tolerates a recovery job that fires early up to the tolerance, not one millisecond more', async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await processor.recover(
            jobDueAt(new Date(NOW.getTime() + EARLY_RECOVERY_TOLERANCE_MS + 1)),
        );

        expect(sleeper.waits).toEqual([]);
        expect(recoverDue).not.toHaveBeenCalled();
        expect(recoverLegacy).not.toHaveBeenCalled();
    });

    it('ignores a malformed job with a warning naming only its id, without crediting', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        await processor.recover({
            id: 'job-1',
            data: { characterId: 'not-an-id', spellId: spellId.toHexString() },
        } as unknown as Job<SpellRecoveryJobData>);

        expect(recoverDue).not.toHaveBeenCalled();
        expect(recoverLegacy).not.toHaveBeenCalled();
        expect(warn.mock.calls.map(([value]) => String(value))).toEqual([
            'Job di recupero job-1 malformato: ignorato',
        ]);
    });

    it('routes a job queued before the deploy, without an instant, to the legacy credit at once', async () => {
        await processor.recover({
            id: 'legacy-1',
            data: {
                characterId: characterId.toHexString(),
                spellId: spellId.toHexString(),
            },
        } as Job<SpellRecoveryJobData>);

        expect(sleeper.waits).toEqual([]);
        expect(recoverLegacy.mock.calls).toEqual([[characterId, spellId]]);
        expect(recoverDue).not.toHaveBeenCalled();
    });

    it('keeps the tolerance a few seconds wide', () => {
        expect(EARLY_RECOVERY_TOLERANCE_MS).toBe(5 * SECOND);
    });
});
