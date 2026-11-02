import type { CitySize } from 'src/content/rules/content-config';

// taglia di gioco di una città: decide quali quest di servizio riceve e il minTitle (D-17, D-20)
export type CityScale = 'village' | 'city' | 'capital';

export const KINGDOM_PREFIXES = [
    'drustea',
    'valan',
    'mirwa',
    'flame',
    'mother',
    'liberia',
] as const;

const QUEST_FILE_OF_KINGDOM: Record<(typeof KINGDOM_PREFIXES)[number], string> =
    {
        drustea: 'drustea',
        valan: 'valan',
        mirwa: 'mirwa',
        flame: 'fiamme',
        mother: 'madre',
        liberia: 'liberia',
    };

export const SPECIAL_QUEST_FILE = 'speciali';

export const DUNGEON_QUEST_FILE = 'dungeon';

// i file di quests/ scritti dal generatore: gli altri sono a mano e non si toccano
export const GENERATED_QUEST_FILES: readonly string[] = [
    ...Object.values(QUEST_FILE_OF_KINGDOM),
    SPECIAL_QUEST_FILE,
    DUNGEON_QUEST_FILE,
];

export const NO_SERVICE_CITY_TYPES: readonly string[] = ['necrorianCity'];

export const NO_CRIME_CITY_TYPES: readonly string[] = ['ferrionCity'];

export const HERO_DUNGEON_CITY_TYPES: readonly string[] = ['necrorianCity'];

export const SPELL_STUDY_CITY = 'Valantar';

export const COLLEGE_CITY = 'Liberia';

// SeaCity prima di City: è anche lui un suffisso «City»
const SIZE_SUFFIXES: readonly CitySize[] = [
    'Capital',
    'SeaCity',
    'City',
    'Village',
];

const SCALE_OF_SIZE: Record<CitySize, CityScale> = {
    Capital: 'capital',
    SeaCity: 'city',
    City: 'city',
    Village: 'village',
};

export function dungeonSizeKeyOf(type: string): CitySize {
    const size = SIZE_SUFFIXES.find((suffix) => type.endsWith(suffix));
    if (!size) throw new RangeError(`Tipo di città senza taglia: ${type}`);
    return size;
}

export function citySizeOf(type: string): CityScale {
    return SCALE_OF_SIZE[dungeonSizeKeyOf(type)];
}

function kingdomOf(type: string): (typeof KINGDOM_PREFIXES)[number] | null {
    return KINGDOM_PREFIXES.find((prefix) => type.startsWith(prefix)) ?? null;
}

// i tipi fuori dai regni (desertVillage, ferrionCity, elfCapital, …) fanno gruppo a sé (D-17)
export function regionalGroupOf(type: string): string {
    return kingdomOf(type) ?? type;
}

export function questFileOf(type: string): string {
    const kingdom = kingdomOf(type);
    return kingdom ? QUEST_FILE_OF_KINGDOM[kingdom] : SPECIAL_QUEST_FILE;
}
