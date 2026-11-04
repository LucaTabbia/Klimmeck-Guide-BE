import { Logger } from '@nestjs/common';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

describe('QuestMaintenanceBoot', () => {
    let migrateAll: jest.Mock;
    let migrateLegendary: jest.Mock;
    let migrateJewels: jest.Mock;
    let migrateDungeons: jest.Mock;
    let request: jest.Mock;
    let errorSpy: jest.SpyInstance;

    function boot(): QuestMaintenanceBoot {
        return new QuestMaintenanceBoot(
            { migrateAll } as never,
            { migrate: migrateLegendary } as never,
            { migrate: migrateJewels } as never,
            { migrate: migrateDungeons } as never,
            { request } as never,
        );
    }

    beforeEach(() => {
        migrateAll = jest.fn().mockResolvedValue({ quests: 0, results: 0 });
        migrateLegendary = jest
            .fn()
            .mockResolvedValue({ legendary: 0, ordinary: 0 });
        migrateJewels = jest
            .fn()
            .mockResolvedValue({ written: 0, missing: [] });
        migrateDungeons = jest
            .fn()
            .mockResolvedValue({ enriched: 0, skipped: 0 });
        request = jest.fn();
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('runs the enemies migration at boot (D-28)', async () => {
        await boot().onApplicationBootstrap();

        expect(migrateAll).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs a failed step by name and code only and keeps booting (D-28)', async () => {
        migrateAll.mockRejectedValue(
            Object.assign(new Error('uri-segreta-da-non-loggare'), {
                name: 'MongoServerError',
                code: 11000,
            }),
        );

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: migrazione dei nemici delle missioni fallita (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
        expect(String(errorSpy.mock.calls[0][0])).not.toContain('uri-segreta');
    });

    it('runs the jewels step after the enemies migration (D-26)', async () => {
        const order: string[] = [];
        migrateAll.mockImplementation(() => {
            order.push('enemies');
            return Promise.resolve({ quests: 0, results: 0 });
        });
        migrateJewels.mockImplementation(() => {
            order.push('jewels');
            return Promise.resolve({ written: 0, missing: [] });
        });

        await boot().onApplicationBootstrap();

        expect(order).toEqual(['enemies', 'jewels']);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('keeps running the jewels step after a failed enemies step (D-26)', async () => {
        migrateAll.mockRejectedValue(new Error('boom'));

        await boot().onApplicationBootstrap();

        expect(migrateJewels).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('logs a failed jewels step by name and keeps booting (D-26)', async () => {
        migrateJewels.mockRejectedValue(
            Object.assign(new Error('uri-segreta-da-non-loggare'), {
                name: 'MongoServerError',
                code: 11000,
            }),
        );

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                "Manutenzione missioni: fasi d'uso dei gioielli (una tantum) fallita (MongoServerError, code 11000), il boot prosegue",
            ],
        ]);
    });

    it('runs enemies, legendary flag, jewels and dungeon stages in order, then requests a generation run (D-04, D-13, D-17)', async () => {
        const order: string[] = [];
        const recording =
            (name: string, report: unknown) => (): Promise<unknown> => {
                order.push(name);
                return Promise.resolve(report);
            };
        migrateAll.mockImplementation(
            recording('enemies', { quests: 0, results: 0 }),
        );
        migrateLegendary.mockImplementation(
            recording('legendary', { legendary: 0, ordinary: 0 }),
        );
        migrateJewels.mockImplementation(
            recording('jewels', { written: 0, missing: [] }),
        );
        migrateDungeons.mockImplementation(
            recording('dungeons', { enriched: 0, skipped: 0 }),
        );
        request.mockImplementation(() => order.push('generation'));

        await boot().onApplicationBootstrap();

        expect(order).toEqual([
            'enemies',
            'legendary',
            'jewels',
            'dungeons',
            'generation',
        ]);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('keeps running the later steps after a failed one-off step (D-04, D-13, D-17)', async () => {
        migrateLegendary.mockRejectedValue(new Error('boom'));
        migrateDungeons.mockRejectedValue(new Error('boom'));

        await boot().onApplicationBootstrap();

        expect(migrateJewels).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: flag dei leggendari (una tantum) fallita (Error), il boot prosegue',
            ],
            [
                'Manutenzione missioni: tappe delle dungeon (una tantum) fallita (Error), il boot prosegue',
            ],
        ]);
    });

    it('logs a failed generation request by name and keeps booting (D-17)', async () => {
        request.mockImplementation(() => {
            throw new Error('boom');
        });

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: richiesta di corsa al generatore fallita (Error), il boot prosegue',
            ],
        ]);
    });
});
