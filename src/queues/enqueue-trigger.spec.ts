import type { Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { FixedClock } from '../../test/auth/fixed-clock';
import { enqueueTrigger, TriggerContext } from './enqueue-trigger';

const NOW = new Date('2026-10-29T10:00:00.000Z');
const DELAY_MS = 90_000;
const JOB_ID = 'test-job-1';

interface TriggerData {
    characterId: string;
}

describe('enqueueTrigger', () => {
    let add: jest.Mock;
    let warn: jest.Mock;
    let context: TriggerContext;

    const enqueue = () =>
        enqueueTrigger(
            { add } as unknown as Queue<TriggerData>,
            {
                name: 'test-trigger',
                data: { characterId: 'fake-character' },
                jobId: JOB_ID,
                dueAt: new Date(NOW.getTime() + DELAY_MS),
            },
            context,
        );

    beforeEach(() => {
        add = jest.fn().mockResolvedValue(undefined);
        warn = jest.fn();
        context = {
            clock: new FixedClock(NOW),
            timeoutMs: 20,
            logger: { warn } as unknown as Logger,
            subject: 'del trigger di prova',
            fallback: 'lo sweep lo recupera',
        };
    });

    it('keeps at most 1000 failed jobs for seven days (D-17a)', async () => {
        await enqueue();

        expect(add).toHaveBeenCalledTimes(1);
        expect(add.mock.calls[0][2]).toEqual({
            jobId: JOB_ID,
            delay: DELAY_MS,
            removeOnComplete: true,
            removeOnFail: { age: 604800, count: 1000 },
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns and gives up when the queue does not answer in time', async () => {
        add.mockReturnValue(new Promise(() => undefined));

        await enqueue();

        expect(warn.mock.calls).toEqual([
            [
                `Accodamento del trigger di prova ${JOB_ID} non confermato entro 20 ms: lo sweep lo recupera`,
            ],
        ]);
    });
});
