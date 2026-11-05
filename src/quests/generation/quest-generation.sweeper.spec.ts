import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { QuestGenerationSweeper } from './quest-generation.sweeper';
import type { QuestGenerator } from './quest-generator.service';

const EVERY_HOUR_MS = 3_600_000;

describe('QuestGenerationSweeper', () => {
    let request: jest.Mock;
    let close: jest.Mock;

    function sweeperWith(sweepIntervalMs: number): QuestGenerationSweeper {
        const config: QuestGenerationConfig = { sweepIntervalMs, target: null };
        const generator = { request, close } as unknown as QuestGenerator;
        return new QuestGenerationSweeper(config, generator);
    }

    function spyUnrefTimers(): {
        setIntervalSpy: jest.SpyInstance;
        unref: jest.Mock;
    } {
        const unref = jest.fn();
        const realSetInterval = global.setInterval;
        const setIntervalSpy = jest
            .spyOn(global, 'setInterval')
            .mockImplementation(((handler: () => void, timeout: number) => {
                const timer = realSetInterval(handler, timeout);
                const original = timer.unref.bind(timer);
                unref.mockImplementation(() => original());
                timer.unref = unref;
                return timer;
            }) as typeof setInterval);
        return { setIntervalSpy, unref };
    }

    beforeEach(() => {
        jest.useFakeTimers();
        request = jest.fn();
        close = jest.fn(() => Promise.resolve());
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('requests a run at boot without awaiting it (D-17)', () => {
        const sweeper = sweeperWith(EVERY_HOUR_MS);

        expect(sweeper.onApplicationBootstrap()).toBeUndefined();

        expect(request).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();
    });

    it('requests a run at every interval with an unref timer (D-17)', () => {
        const { setIntervalSpy, unref } = spyUnrefTimers();
        const sweeper = sweeperWith(EVERY_HOUR_MS);

        sweeper.onApplicationBootstrap();
        jest.advanceTimersByTime(2 * EVERY_HOUR_MS);

        expect(setIntervalSpy).toHaveBeenCalledWith(
            expect.any(Function),
            EVERY_HOUR_MS,
        );
        expect(unref).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(3);
    });

    it('runs only the boot request when the interval is 0 (D-17)', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(0);

        sweeper.onApplicationBootstrap();
        jest.advanceTimersByTime(10 * EVERY_HOUR_MS);

        expect(setIntervalSpy).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('stops the timer and closes the generator on shutdown (D-17)', async () => {
        let finishRun!: () => void;
        close.mockReturnValue(
            new Promise<void>((resolve) => {
                finishRun = resolve;
            }),
        );
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
        const sweeper = sweeperWith(EVERY_HOUR_MS);
        sweeper.onApplicationBootstrap();
        let stopped = false;

        const destroy = sweeper.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        jest.advanceTimersByTime(3 * EVERY_HOUR_MS);

        expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
        expect(stopped).toBe(false);
        expect(request).toHaveBeenCalledTimes(1);
        finishRun();
        await destroy;
        expect(stopped).toBe(true);
    });
});
