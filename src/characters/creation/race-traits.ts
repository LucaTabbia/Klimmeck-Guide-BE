import { CityType } from 'src/models/enums/city-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';

export interface AgeRange {
    readonly minAge: number;
    readonly maxAge: number;
}

export interface RaceTraitsRow extends AgeRange {
    readonly race: RaceType;
}

// età ammesse per razza, allineate al lore (D-06): unica fonte per validazione e query raceTraits
export const RACE_TRAITS: Readonly<Record<RaceType, AgeRange>> = Object.freeze({
    [RaceType.human]: { minAge: 16, maxAge: 200 },
    [RaceType.elf]: { minAge: 100, maxAge: 9999 },
    [RaceType.halfelf]: { minAge: 16, maxAge: 130 },
    [RaceType.dwarf]: { minAge: 40, maxAge: 140 },
    [RaceType.gnome]: { minAge: 16, maxAge: 60 },
    [RaceType.halfling]: { minAge: 16, maxAge: 70 },
    [RaceType.dragonborn]: { minAge: 16, maxAge: 180 },
    [RaceType.tiefling]: { minAge: 16, maxAge: 120 },
    [RaceType.aarakocra]: { minAge: 3, maxAge: 40 },
});

type RaceHomeCityTypes = Readonly<Record<RaceType, readonly CityType[]>>;

const HUMAN_HOME_CITY_TYPES: readonly CityType[] = [
    CityType.drusteaCapital,
    CityType.valanCapital,
    CityType.mirwaCapital,
    CityType.liberiaCapital,
];

// tipi di City in cui nasce ogni razza (D-10); più tipi = scelta casuale tra tutte le città esistenti di quei tipi
export const RACE_HOME_CITY_TYPES: RaceHomeCityTypes = Object.freeze({
    [RaceType.elf]: [CityType.elfCapital],
    [RaceType.gnome]: [CityType.motherCapital],
    [RaceType.dwarf]: [CityType.motherCapital],
    [RaceType.tiefling]: [CityType.motherCapital],
    [RaceType.halfling]: [CityType.liberiaCapital],
    [RaceType.aarakocra]: [CityType.aarakocraVillage],
    [RaceType.dragonborn]: [CityType.mountainVillage],
    [RaceType.human]: HUMAN_HOME_CITY_TYPES,
    [RaceType.halfelf]: HUMAN_HOME_CITY_TYPES,
});

export function listRaceTraits(): RaceTraitsRow[] {
    return Object.values(RaceType).map((race) => ({
        race,
        ...RACE_TRAITS[race],
    }));
}

export function isAgeAllowedForRace(race: RaceType, age: number): boolean {
    const { minAge, maxAge } = RACE_TRAITS[race];
    return age >= minAge && age <= maxAge;
}
