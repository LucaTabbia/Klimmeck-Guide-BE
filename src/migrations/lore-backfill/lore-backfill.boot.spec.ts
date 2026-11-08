import { Logger } from '@nestjs/common';
import { CharacterCreationModule } from 'src/characters/creation/character-creation.module';
import { LoreGeographyModule } from 'src/lore/lore-geography.module';
import { LoreVisibilityModule } from 'src/lore/lore-visibility.module';
import { LoreModule } from 'src/lore/lore.module';
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { TravelModule } from 'src/travel/travel.module';
import { LoreBackfillBoot } from './lore-backfill.boot';
import { LoreBackfillModule } from './lore-backfill.module';

describe('LoreBackfillBoot', () => {
    let backfillAll: jest.Mock;
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    function boot(): LoreBackfillBoot {
        return new LoreBackfillBoot({ backfillAll } as never);
    }

    function importsOf(module: object): unknown[] {
        return (Reflect.getMetadata('imports', module) as unknown[]) ?? [];
    }

    beforeEach(() => {
        backfillAll = jest.fn().mockResolvedValue({
            characters: 4,
            updated: 3,
            loreAdded: 21,
            enemiesAdded: 5,
            withoutCity: 1,
        });
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('runs the lore backfill once at boot and logs only counts (D-11)', async () => {
        await boot().onApplicationBootstrap();

        expect(backfillAll).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls).toEqual([
            [
                'Backfill delle lore: personaggi 4, aggiornati 3, lore aggiunte 21, nemici aggiunti 5, senza città 1',
            ],
        ]);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs a failed backfill by name and code only and keeps booting (D-11)', async () => {
        backfillAll.mockRejectedValue(
            Object.assign(new Error('uri-segreta-da-non-loggare'), {
                name: 'MongoServerError',
                code: 11000,
            }),
        );

        await expect(boot().onApplicationBootstrap()).resolves.toBeUndefined();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Backfill delle lore fallito (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
        expect(String(errorSpy.mock.calls[0][0])).not.toContain('uri-segreta');
    });

    // il cablaggio in AppModule è provato da test/app.int-spec.ts: importare qui src/app.module
    // farebbe validare l'ambiente al caricamento e senza .env (CI) jest crolla
    it('is imported by no feature module (D-11)', () => {
        for (const feature of [
            LoreModule,
            TravelModule,
            QuestOutcomesModule,
            CharacterCreationModule,
            LoreVisibilityModule,
            LoreGeographyModule,
        ])
            expect(importsOf(feature)).not.toContain(LoreBackfillModule);
    });
});
