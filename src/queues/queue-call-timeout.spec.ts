import {
    QUEUE_CALL_TIMED_OUT,
    QUEUE_CALL_TIMEOUT_MS,
    withinTimeout,
} from './queue-call-timeout';

describe('withinTimeout', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('returns the value of a call that settles in time', async () => {
        await expect(
            withinTimeout(Promise.resolve('job'), 1_000),
        ).resolves.toBe('job');
    });

    it('propagates the rejection of a call that fails in time', async () => {
        await expect(
            withinTimeout(
                Promise.reject(new Error('queue unavailable')),
                1_000,
            ),
        ).rejects.toThrow('queue unavailable');
    });

    it('returns QUEUE_CALL_TIMED_OUT when the call never settles', async () => {
        await expect(
            withinTimeout(new Promise<never>(() => undefined), 10),
        ).resolves.toBe(QUEUE_CALL_TIMED_OUT);
    });

    it('swallows a rejection that arrives after the timeout', async () => {
        let reject: (reason: Error) => void = () => undefined;
        const late = new Promise<never>((_, rejectLate) => {
            reject = rejectLate;
        });
        const listener = jest.fn();
        process.on('unhandledRejection', listener);
        try {
            await expect(withinTimeout(late, 5)).resolves.toBe(
                QUEUE_CALL_TIMED_OUT,
            );

            reject(new Error('late'));
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setImmediate(resolve));

            expect(listener).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', listener);
        }
    });

    it('clears its timer once the call settles', async () => {
        jest.useFakeTimers();

        await withinTimeout(Promise.resolve(1), 60_000);

        expect(jest.getTimerCount()).toBe(0);
    });

    it('defaults to two seconds', () => {
        expect(QUEUE_CALL_TIMEOUT_MS).toBe(2_000);
    });
});
