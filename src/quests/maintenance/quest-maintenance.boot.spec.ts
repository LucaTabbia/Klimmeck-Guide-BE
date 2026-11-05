import { Logger } from '@nestjs/common';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

describe('QuestMaintenanceBoot', () => {
    let migrateAll: jest.Mock;
    let resetGenerated: jest.Mock;
    let redrawHunts: jest.Mock;
    let restageDungeons: jest.Mock;
    let request: jest.Mock;
    let errorSpy: jest.SpyInstance;

    function boot(): QuestMaintenanceBoot {
        return new QuestMaintenanceBoot(
            { migrateAll } as never,
            { migrate: resetGenerated } as never,
            { migrate: redrawHunts } as never,
            { migrate: restageDungeons } as never,
            { request } as never,
        );
    }

    const failure = (): Error =>
        Object.assign(new Error('uri-segreta-da-non-loggare'), {
            name: 'MongoServerError',
            code: 11000,
        });

    beforeEach(() => {
        migrateAll = jest.fn().mockResolvedValue({ quests: 0, results: 0 });
        resetGenerated = jest.fn().mockResolvedValue({ deleted: 0, kept: 0 });
        redrawHunts = jest.fn().mockResolvedValue({
            redrawn: 0,
            coherent: 0,
            withoutPrey: 0,
            inLane: 0,
        });
        restageDungeons = jest.fn().mockResolvedValue({
            recomposed: 0,
            coherent: 0,
            skipped: 0,
            inLane: 0,
        });
        request = jest.fn();
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('runs the permanent enemies migration at boot without errors (D-28)', async () => {
        await boot().onApplicationBootstrap();

        expect(migrateAll).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('runs enemies, reset, hunt prey and dungeon stages in order, then requests a generation run (D-06, D-07)', async () => {
        await boot().onApplicationBootstrap();

        const order = [
            migrateAll,
            resetGenerated,
            redrawHunts,
            restageDungeons,
            request,
        ].map((mock) => mock.mock.invocationCallOrder);
        expect(order.map((calls) => calls.length)).toEqual([1, 1, 1, 1, 1]);
        const firsts = order.map(([first]) => first);
        expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    });

    it('logs a failed step by name and code only and keeps booting (D-28)', async () => {
        migrateAll.mockRejectedValue(failure());

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: migrazione dei nemici delle missioni fallita (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
        expect(String(errorSpy.mock.calls[0][0])).not.toContain('uri-segreta');
    });

    it('keeps booting after a failed one-off step (D-06)', async () => {
        resetGenerated.mockRejectedValue(failure());

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(redrawHunts).toHaveBeenCalledTimes(1);
        expect(restageDungeons).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: reset delle generate (una tantum) fallita (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
    });
});
