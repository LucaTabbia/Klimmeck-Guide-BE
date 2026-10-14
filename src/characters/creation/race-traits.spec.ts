import {
    RACE_HOME_CITY_TYPES,
    RACE_TRAITS,
    isAgeAllowedForRace,
    listRaceTraits,
} from 'src/characters/creation/race-traits';
import { CityType } from 'src/models/enums/city-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';

describe('race traits', () => {
    it('allows the lore age range of every race', () => {
        expect(RACE_TRAITS).toEqual({
            human: { minAge: 16, maxAge: 200 },
            elf: { minAge: 100, maxAge: 9999 },
            halfelf: { minAge: 16, maxAge: 130 },
            dwarf: { minAge: 40, maxAge: 140 },
            gnome: { minAge: 16, maxAge: 60 },
            halfling: { minAge: 16, maxAge: 70 },
            dragonborn: { minAge: 16, maxAge: 180 },
            tiefling: { minAge: 16, maxAge: 120 },
            aarakocra: { minAge: 3, maxAge: 40 },
        });
    });

    it('has exactly one age range per race', () => {
        const races = Object.keys(RACE_TRAITS);

        expect(races).toHaveLength(9);
        expect(races).toEqual(expect.arrayContaining(Object.values(RaceType)));
    });

    it('maps every race to its lore home city types', () => {
        expect(RACE_HOME_CITY_TYPES).toEqual({
            elf: ['elfCapital'],
            gnome: ['motherCapital'],
            dwarf: ['motherCapital'],
            tiefling: ['motherCapital'],
            halfling: ['liberiaCapital'],
            aarakocra: ['aarakocraVillage'],
            dragonborn: ['mountainVillage'],
            human: [
                'drusteaCapital',
                'valanCapital',
                'mirwaCapital',
                'liberiaCapital',
            ],
            halfelf: [
                'drusteaCapital',
                'valanCapital',
                'mirwaCapital',
                'liberiaCapital',
            ],
        });
    });

    it('uses only existing city types as homes', () => {
        const cityTypes: string[] = Object.values(CityType);

        for (const homeTypes of Object.values(RACE_HOME_CITY_TYPES)) {
            for (const homeType of homeTypes) {
                expect(cityTypes).toContain(homeType);
            }
        }
    });

    it('lists the race traits in the RaceType order', () => {
        expect(listRaceTraits()).toEqual([
            { race: 'dragonborn', minAge: 16, maxAge: 180 },
            { race: 'elf', minAge: 100, maxAge: 9999 },
            { race: 'gnome', minAge: 16, maxAge: 60 },
            { race: 'halfling', minAge: 16, maxAge: 70 },
            { race: 'halfelf', minAge: 16, maxAge: 130 },
            { race: 'human', minAge: 16, maxAge: 200 },
            { race: 'dwarf', minAge: 40, maxAge: 140 },
            { race: 'tiefling', minAge: 16, maxAge: 120 },
            { race: 'aarakocra', minAge: 3, maxAge: 40 },
        ]);
    });

    it('returns fresh rows that cannot alter the age table', () => {
        const rows = listRaceTraits() as Array<{ minAge: number }>;
        rows[0].minAge = 0;

        expect(RACE_TRAITS[RaceType.dragonborn].minAge).toBe(16);
        expect(listRaceTraits()[0].minAge).toBe(16);
    });

    it.each(Object.values(RaceType))(
        'allows a %s age only within its inclusive range',
        (race) => {
            const { minAge, maxAge } = RACE_TRAITS[race];

            expect(isAgeAllowedForRace(race, minAge)).toBe(true);
            expect(isAgeAllowedForRace(race, maxAge)).toBe(true);
            expect(isAgeAllowedForRace(race, minAge - 1)).toBe(false);
            expect(isAgeAllowedForRace(race, maxAge + 1)).toBe(false);
        },
    );
});
