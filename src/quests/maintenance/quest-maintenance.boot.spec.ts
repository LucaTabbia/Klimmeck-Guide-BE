import { Logger } from '@nestjs/common';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

describe('QuestMaintenanceBoot', () => {
    let calls: string[];
    let migrateAll: jest.Mock;
    let report: jest.Mock;
    let dungeonOrder: jest.Mock;
    let errorSpy: jest.SpyInstance;

    function boot(): QuestMaintenanceBoot {
        return new QuestMaintenanceBoot(
            { migrateAll } as never,
            { report } as never,
            { report: dungeonOrder } as never,
        );
    }

    function secretError(): Error {
        return Object.assign(new Error('uri-segreta-da-non-loggare'), {
            name: 'MongoServerError',
            code: 11000,
        });
    }

    beforeEach(() => {
        calls = [];
        migrateAll = jest.fn(() => {
            calls.push('migrateAll');
            return Promise.resolve({ quests: 0, results: 0 });
        });
        report = jest.fn(() => {
            calls.push('report');
            return Promise.resolve({ checked: 0, invalid: 0 });
        });
        dungeonOrder = jest.fn(() => {
            calls.push('dungeonOrder');
            return Promise.resolve({ checked: 0, outOfOrder: 0 });
        });
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

    it('logs a failed step by name and code only and keeps booting (D-28)', async () => {
        migrateAll.mockRejectedValue(secretError());

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: migrazione dei nemici delle missioni fallita (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
        expect(String(errorSpy.mock.calls[0][0])).not.toContain('uri-segreta');
        expect(report).toHaveBeenCalledTimes(1);
    });

    it('runs the group prize report after the enemy migration without blocking (D-24)', async () => {
        await boot().onApplicationBootstrap();

        expect(calls).toEqual(['migrateAll', 'report', 'dungeonOrder']);

        report.mockRejectedValue(secretError());

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Manutenzione missioni: report dei premi per titolo fallita (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
    });

    it('runs the dungeon order report last without blocking (quick 261113-aql)', async () => {
        dungeonOrder.mockRejectedValue(secretError());

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(calls).toEqual(['migrateAll', 'report']);
        expect(dungeonOrder).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls).toEqual([
            [
                "Manutenzione missioni: report dell'ordine delle dungeon fallita (MongoServerError, code 11000), il boot prosegue",
            ],
        ]);
    });
});
