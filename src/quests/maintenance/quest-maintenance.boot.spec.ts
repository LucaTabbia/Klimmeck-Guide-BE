import { Logger } from '@nestjs/common';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

describe('QuestMaintenanceBoot', () => {
    let migrateAll: jest.Mock;
    let errorSpy: jest.SpyInstance;

    function boot(): QuestMaintenanceBoot {
        return new QuestMaintenanceBoot({ migrateAll } as never);
    }

    beforeEach(() => {
        migrateAll = jest.fn().mockResolvedValue({ quests: 0, results: 0 });
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
});
