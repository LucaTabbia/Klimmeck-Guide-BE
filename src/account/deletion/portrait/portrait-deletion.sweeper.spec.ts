import { Logger } from '@nestjs/common';
import { PortraitDeletionService } from './portrait-deletion.service';
import { PortraitDeletionSweeper } from './portrait-deletion.sweeper';

const EVERY_MINUTE_MS = 60_000;

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

const flushMicrotasks = async () => {
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

describe('PortraitDeletionSweeper', () => {
    let flush: jest.Mock<Promise<number>, []>;

    function sweeperWith(sweepIntervalMs: number): PortraitDeletionSweeper {
        return new PortraitDeletionSweeper({ sweepIntervalMs }, {
            flush,
        } as unknown as PortraitDeletionService);
    }

    beforeEach(() => {
        jest.useFakeTimers();
        flush = jest.fn<Promise<number>, []>().mockResolvedValue(0);
        jest.spyOn(Logger.prototype, 'log').mockImplementation();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('flushes at boot and on every sweep interval (portrait default)', async () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(EVERY_MINUTE_MS);

        expect(sweeper.onApplicationBootstrap()).toBeUndefined();
        expect(flush).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).toHaveBeenCalledWith(
            expect.any(Function),
            EVERY_MINUTE_MS,
        );

        await flushMicrotasks();
        jest.advanceTimersByTime(EVERY_MINUTE_MS);
        await flushMicrotasks();
        jest.advanceTimersByTime(EVERY_MINUTE_MS);
        expect(flush).toHaveBeenCalledTimes(3);

        await sweeper.onModuleDestroy();
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(flush).toHaveBeenCalledTimes(3);
    });

    it('does not start the interval when the sweep is off (portrait default)', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(0);

        sweeper.onApplicationBootstrap();

        expect(flush).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('runs one flush at a time (portrait default)', () => {
        flush.mockReturnValue(new Promise(() => undefined));
        const sweeper = sweeperWith(0);

        const first = sweeper.sweep();
        const second = sweeper.sweep();

        expect(second).toBe(first);
        expect(flush).toHaveBeenCalledTimes(1);
    });

    it('kicks a sweep without returning it and logs a failure instead of rejecting (WR-01)', async () => {
        flush.mockRejectedValue(new Error('outbox down'));
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        const sweeper = sweeperWith(0);

        expect(sweeper.kick()).toBeUndefined();
        await flushMicrotasks();

        expect(flush).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('sweeps once more after the running flush when kicked during it (WR-01)', async () => {
        const pending = deferred<number>();
        flush.mockReturnValueOnce(pending.promise);
        const sweeper = sweeperWith(0);
        void sweeper.sweep();

        sweeper.kick();
        sweeper.kick();
        expect(flush).toHaveBeenCalledTimes(1);

        pending.resolve(0);
        await flushMicrotasks();
        expect(flush).toHaveBeenCalledTimes(2);
    });

    it('waits for the running flush on shutdown (portrait default)', async () => {
        const pending = deferred<number>();
        flush.mockReturnValue(pending.promise);
        const sweeper = sweeperWith(0);
        const sweep = sweeper.sweep();
        let destroyed = false;

        const destroy = sweeper.onModuleDestroy().then(() => {
            destroyed = true;
        });
        await flushMicrotasks();
        expect(destroyed).toBe(false);

        pending.resolve(2);
        await destroy;

        await expect(sweep).resolves.toBe(2);
    });
});
