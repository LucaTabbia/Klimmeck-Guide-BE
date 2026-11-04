import { Logger } from '@nestjs/common';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { QuestGenerator } from './quest-generator.service';

type RunSpy = jest.SpyInstance<Promise<number>, []>;
type Closable = { close(): Promise<void> };

const closeOf = (generator: QuestGenerator): Promise<void> =>
    (generator as unknown as Closable).close();

describe('QuestGenerator single-flight', () => {
    let generator: QuestGenerator;
    let runs: RunSpy;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        const config: QuestGenerationConfig = {
            sweepIntervalMs: 0,
            target: null,
        };
        generator = new QuestGenerator(
            null as never,
            null as never,
            null as never,
            null as never,
            null as never,
            null as never,
            null as never,
            config,
            null as never,
        );
        runs = jest
            .spyOn(
                generator as unknown as { runOnce(): Promise<number> },
                'runOnce',
            )
            .mockResolvedValue(0);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('resolves whenIdle only after the rerun started by the failed run (D-17)', async () => {
        let finishRerun!: (created: number) => void;
        runs.mockImplementationOnce(async () => {
            await Promise.resolve();
            generator.request();
            throw new Error('boom');
        }).mockImplementationOnce(
            () =>
                new Promise<number>((resolve) => {
                    finishRerun = resolve;
                }),
        );
        let idle = false;

        generator.request();
        const waiting = generator.whenIdle().then(() => {
            idle = true;
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(runs).toHaveBeenCalledTimes(2);
        expect(idle).toBe(false);
        finishRerun(0);
        await waiting;
        expect(idle).toBe(true);
    });

    it('starts no run on request after close (D-17)', async () => {
        await closeOf(generator);
        generator.request();
        await generator.whenIdle();

        expect(runs).not.toHaveBeenCalled();
    });

    it('drops the queued rerun when closed during a run (D-17)', async () => {
        let finishRun!: (created: number) => void;
        runs.mockImplementationOnce(
            () =>
                new Promise<number>((resolve) => {
                    finishRun = resolve;
                }),
        );

        generator.request();
        generator.request();
        const closed = closeOf(generator);
        finishRun(1);
        await closed;
        await generator.whenIdle();

        expect(runs).toHaveBeenCalledTimes(1);
    });

    it('still serves an explicit generate after close (D-16)', async () => {
        await closeOf(generator);

        await expect(generator.generate()).resolves.toBe(0);
        expect(runs).toHaveBeenCalledTimes(1);
    });
});
