import type { Job } from 'bull';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import type { AmbushJobData } from './ambush-job';
import { AmbushProcessor } from './ambush.processor';
import type { AmbushResolutionService } from './ambush-resolution.service';

const NOW = new Date('2026-10-21T20:00:00.000Z');
const START = new Date('2026-10-21T10:00:00.000Z');
const CHARACTER_ID = new Types.ObjectId('64b0000000000000000000a1');

const jobOf = (data: unknown): Job<AmbushJobData> =>
    ({ id: 'j', data }) as unknown as Job<AmbushJobData>;

describe('AmbushProcessor', () => {
    let resolve: jest.Mock;
    let processor: AmbushProcessor;

    beforeEach(() => {
        resolve = jest.fn().mockResolvedValue('won');
        const resolution = { resolve } as unknown as AmbushResolutionService;
        processor = new AmbushProcessor(resolution, new FixedClock(NOW));
    });

    it('ignores malformed ambush job data (D-05)', async () => {
        await processor.handle(jobOf({ characterId: 'x' }));

        expect(resolve).not.toHaveBeenCalled();
    });

    it('leaves an early ambush job to the sweep (D-05)', async () => {
        await processor.handle(
            jobOf({
                characterId: CHARACTER_ID.toHexString(),
                startTime: START.getTime(),
                at: NOW.getTime() + 1,
            }),
        );

        expect(resolve).not.toHaveBeenCalled();
    });

    it('resolves a due ambush job by its identity (D-05)', async () => {
        await processor.handle(
            jobOf({
                characterId: CHARACTER_ID.toHexString(),
                startTime: START.getTime(),
                at: NOW.getTime(),
            }),
        );

        expect(resolve).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledWith({
            characterId: CHARACTER_ID,
            startTime: START,
            at: NOW,
        });
    });
});
