import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import {
    racesWithoutHomeCity,
    StartingCitiesReporter,
} from 'src/characters/creation/starting-cities.reporter';
import { CityDocument } from 'src/models/city.model';
import { RaceType } from 'src/models/enums/race-type.enum';

const ALL_HOME_CITY_TYPES = [
    'elfCapital',
    'motherCapital',
    'liberiaCapital',
    'aarakocraVillage',
    'mountainVillage',
];

function cityModelReturning(exec: () => Promise<unknown[]>) {
    const distinct = jest.fn().mockReturnValue({ exec });
    const model = { distinct } as unknown as Model<CityDocument>;
    return { model, distinct };
}

describe('racesWithoutHomeCity', () => {
    it('lists every race in enum order when no city exists', () => {
        expect(racesWithoutHomeCity([])).toEqual(Object.values(RaceType));
    });

    it('lists no race when every home city type exists', () => {
        expect(racesWithoutHomeCity(ALL_HOME_CITY_TYPES)).toEqual([]);
    });

    it('covers humans and half-elves with any human capital', () => {
        expect(racesWithoutHomeCity(['drusteaCapital'])).toEqual([
            'dragonborn',
            'elf',
            'gnome',
            'halfling',
            'dwarf',
            'tiefling',
            'aarakocra',
        ]);
    });

    it('ignores city types that are no race home', () => {
        expect(racesWithoutHomeCity(['drusteaCity', 'unknown'])).toEqual(
            Object.values(RaceType),
        );
    });
});

describe('StartingCitiesReporter', () => {
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
        error.mockRestore();
    });

    function warnings(): string[] {
        return warn.mock.calls.map(([message]) => String(message));
    }

    it('warns about nothing when every race has a home city', async () => {
        const { model, distinct } = cityModelReturning(() =>
            Promise.resolve(ALL_HOME_CITY_TYPES),
        );

        await new StartingCitiesReporter(model).onApplicationBootstrap();

        expect(distinct).toHaveBeenCalledWith('type');
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns once per race without a home city, naming the expected city type', async () => {
        const { model } = cityModelReturning(() =>
            Promise.resolve(['drusteaCapital']),
        );

        await new StartingCitiesReporter(model).onApplicationBootstrap();

        expect(warn).toHaveBeenCalledTimes(7);
        const elfWarning = warnings().find((message) =>
            message.includes('elfCapital'),
        );
        expect(elfWarning).toContain('elf');
        expect(elfWarning).toContain('STARTING_LOCATION_UNAVAILABLE');
    });

    it('logs the cause without throwing when the cities cannot be read', async () => {
        const { model } = cityModelReturning(() =>
            Promise.reject(
                Object.assign(new Error('down'), {
                    name: 'MongoServerError',
                    code: 6,
                }),
            ),
        );

        await expect(
            new StartingCitiesReporter(model).onApplicationBootstrap(),
        ).resolves.toBe(undefined);

        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain(
            'MongoServerError, code 6',
        );
        expect(warn).not.toHaveBeenCalled();
    });
});
