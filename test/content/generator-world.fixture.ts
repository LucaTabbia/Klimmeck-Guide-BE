import { ContentIndex, indexContent } from 'src/content/checking/content-index';
import {
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
    WorldCity,
    WorldPoi,
} from 'src/content/loading/content-tree';
import {
    GeneratorInput,
    GeneratorResult,
} from 'src/content/generation/fixed-quests.generator';
import { ContentConfig } from 'src/content/rules/content-config';
import { loadTestContentTree } from '../fixtures/content-tree.fixture';

type Raw = Record<string, unknown>;

// id leggibili: due cifre per il tipo di voce, il resto è il numero progressivo
function fixtureId(kind: number, n: number): string {
    return `6b${kind.toString(16).padStart(2, '0')}${n.toString(16).padStart(20, '0')}`;
}

export const cityId = (n: number) => fixtureId(0x0c, n);
const poiId = (city: number, n: number) => fixtureId(0x0d, city * 16 + n);
const loreId = (n: number) => fixtureId(0x0a, n);
const enemyId = (n: number) => fixtureId(0x01, n);
const equipmentId = (n: number) => fixtureId(0x0e, n);
const lootId = (n: number) => fixtureId(0x0f, n);

export const NEW_ID_PREFIX = '6b09';

export interface CitySeed {
    n: number;
    name: string;
    type: string;
    pois: string[][];
}

// POI 0 = marker della città; gli altri nell'ordine della lista
const CITY_SEEDS: readonly CitySeed[] = [
    {
        n: 1,
        name: 'Drustal',
        type: 'drusteaCapital',
        pois: [['forest'], ['dungeon', 'ruins']],
    },
    { n: 2, name: 'Brina', type: 'drusteaCity', pois: [['forest']] },
    {
        n: 3,
        name: 'Corvia',
        type: 'drusteaCity',
        pois: [['hills'], ['dungeon', 'mountainLamstone']],
    },
    { n: 4, name: 'Marea', type: 'drusteaSeaCity', pois: [['forest']] },
    { n: 5, name: 'Ondalta', type: 'drusteaSeaCity', pois: [['hills']] },
    {
        n: 6,
        name: 'Aia',
        type: 'drusteaVillage',
        pois: [['dungeon', 'forest'], ['forest']],
    },
    {
        n: 7,
        name: 'Borgo Felce',
        type: 'drusteaVillage',
        pois: [['forest'], ['dungeon', 'harkenIsland']],
    },
    { n: 8, name: 'Colle', type: 'drusteaVillage', pois: [['hills']] },
    { n: 9, name: 'Dirupo', type: 'drusteaVillage', pois: [['desert']] },
    {
        n: 10,
        name: 'Erba',
        type: 'drusteaVillage',
        pois: [['forest', 'hills']],
    },
    { n: 11, name: 'Valantar', type: 'valanCapital', pois: [['valanPlains']] },
    {
        n: 12,
        name: 'Liberia',
        type: 'liberiaCapital',
        pois: [['liberiaIsland']],
    },
    {
        n: 13,
        name: 'Ferrion',
        type: 'ferrionCity',
        pois: [['hills'], ['dungeon', 'glounet']],
    },
    {
        n: 14,
        name: 'Necrorian',
        type: 'necrorianCity',
        pois: [['dungeon', 'glounet'], ['forest']],
    },
];

function cityOf(seed: CitySeed): WorldCity {
    const marker: WorldPoi = {
        id: poiId(seed.n, 0),
        type: ['city'],
        location: [seed.n, 45],
    };
    const others = seed.pois.map(
        (types, index): WorldPoi => ({
            id: poiId(seed.n, index + 1),
            type: types,
            location: [seed.n, 46 + index],
        }),
    );
    return {
        id: cityId(seed.n),
        name: seed.name,
        type: seed.type,
        markerLocation: marker.id,
        relatedLore: null,
        pointsOfInterest: [marker, ...others],
    };
}

export const GENERATOR_IDS = {
    capital: cityId(1),
    cities: [cityId(2), cityId(3), cityId(4), cityId(5)],
    villages: [cityId(6), cityId(7), cityId(8), cityId(9), cityId(10)],
    valantar: cityId(11),
    liberia: cityId(12),
    ferrion: cityId(13),
    necrorian: cityId(14),
    capitalDungeonPoi: poiId(1, 2),
    cityDungeonPoi: poiId(3, 2),
    villageDungeonPoi: poiId(6, 1),
    harkenDungeonPoi: poiId(7, 2),
    ferrionGlounetPoi: poiId(13, 2),
    necrorianGlounetPoi: poiId(14, 1),
    cityLore: (n: number) => loreId(n),
    wolfLore: loreId(31),
    bearLore: loreId(32),
    monsterLore: loreId(33),
    wolf: enemyId(1),
    bear: enemyId(2),
    boar: enemyId(3),
    spider: enemyId(11),
    werewolf: enemyId(12),
    troll: enemyId(13),
    basilisk: enemyId(14),
    wraith: enemyId(15),
    beholder: enemyId(16),
    dragon: enemyId(17),
    kraken: enemyId(18),
    tarrasque: enemyId(21),
    bandit: enemyId(22),
    shortSword: equipmentId(1),
    mace: equipmentId(2),
    torch: equipmentId(3),
    flameSword: equipmentId(4),
    acidAxe: equipmentId(5),
    thunderSpear: equipmentId(6),
    sunBlade: equipmentId(7),
    oakShield: equipmentId(8),
    frostHammer: equipmentId(9),
    minorPotion: lootId(1),
    potion: lootId(2),
    greaterPotion: lootId(3),
    elixir: lootId(4),
    ration: lootId(5),
    driedMeat: lootId(6),
    elvenBread: lootId(7),
    lantern: lootId(8),
    rope: lootId(9),
    climbingKit: lootId(10),
    ancientMap: lootId(11),
} as const;

const ids = GENERATOR_IDS;

function cityLoreOf(seed: CitySeed): Raw {
    return {
        id: loreId(seed.n),
        type: 'city',
        name: seed.name,
        description: `La città di ${seed.name}.`,
        relatedLore: [],
        city: cityId(seed.n),
    };
}

function loreOf(id: string, type: string, name: string): Raw {
    return { id, type, name, description: `Lore di ${name}.` };
}

interface EnemySeed {
    id: string;
    name: string;
    category: string;
    level?: number;
    pe: number;
    locations: string[];
    energyWeaknesses?: string[];
    baseWeaknesses?: string[];
    relatedLore?: string[];
}

function enemyOf(seed: EnemySeed): Raw {
    const source: Raw = { pe: seed.pe, pf: 20, damagePerRound: { cut: 5 } };
    if (seed.level !== undefined) source.level = seed.level;
    return {
        id: seed.id,
        name: seed.name,
        category: seed.category,
        source,
        locations: seed.locations,
        energyWeaknesses: seed.energyWeaknesses ?? [],
        baseWeaknesses: seed.baseWeaknesses ?? [],
        relatedLore: seed.relatedLore ?? [],
        spells: [],
        imagePath: `assets/images/${seed.id}.png`,
    };
}

const ENEMY_SEEDS: readonly EnemySeed[] = [
    {
        id: ids.wolf,
        name: 'Lupo',
        category: 'animal',
        pe: 50,
        locations: ['forest', 'hills'],
        baseWeaknesses: ['cut'],
        relatedLore: [ids.wolfLore],
    },
    {
        id: ids.bear,
        name: 'Orso',
        category: 'animal',
        pe: 700,
        locations: ['forest', 'mountainLamstone'],
        relatedLore: [ids.bearLore],
    },
    {
        id: ids.boar,
        name: 'Cinghiale',
        category: 'animal',
        pe: 100,
        locations: ['forest'],
        baseWeaknesses: ['blunt'],
    },
    {
        id: ids.spider,
        name: 'Ragno gigante',
        category: 'monster',
        level: 3,
        pe: 150,
        locations: ['forest'],
        baseWeaknesses: ['blunt'],
        energyWeaknesses: ['fire'],
        relatedLore: [ids.monsterLore],
    },
    {
        id: ids.werewolf,
        name: 'Lupo mannaro',
        category: 'monster',
        level: 4,
        pe: 250,
        locations: ['forest', 'hills'],
        energyWeaknesses: ['radiant'],
    },
    {
        id: ids.troll,
        name: 'Troll delle caverne',
        category: 'monster',
        level: 6,
        pe: 600,
        locations: ['mountainLamstone', 'undergroundLamstone'],
        energyWeaknesses: ['fire', 'acid'],
    },
    {
        id: ids.basilisk,
        name: 'Basilisco',
        category: 'monster',
        level: 7,
        pe: 750,
        locations: ['desert'],
    },
    {
        id: ids.wraith,
        name: 'Spettro errante',
        category: 'monster',
        level: 12,
        pe: 2000,
        locations: ['all'],
        energyWeaknesses: ['radiant'],
    },
    {
        id: ids.beholder,
        name: 'Beholder',
        category: 'monster',
        level: 13,
        pe: 2200,
        locations: ['undergroundTemistos'],
    },
    {
        id: ids.dragon,
        name: 'Drago del Glounet',
        category: 'monster',
        level: 18,
        pe: 4200,
        locations: ['glounet'],
        energyWeaknesses: ['cold'],
    },
    {
        id: ids.kraken,
        name: 'Kraken',
        category: 'monster',
        level: 19,
        pe: 4900,
        locations: ['harkenIsland'],
        energyWeaknesses: ['lightning'],
        baseWeaknesses: ['pierce'],
    },
    {
        id: ids.tarrasque,
        name: 'Tarrasque',
        category: 'legendary',
        pe: 50000,
        locations: ['all', 'glounet', 'forest'],
    },
    {
        id: ids.bandit,
        name: 'Bandito',
        category: 'humanoid',
        level: 3,
        pe: 150,
        locations: ['forest', 'ruins'],
    },
];

export interface EquipmentSeed {
    id: string;
    name: string;
    rarity: string;
    equipType?: string;
    base?: [string, number][];
    energy?: [string, number][];
}

function equipmentOf(seed: EquipmentSeed): Raw {
    const damage = ([type, power]: [string, number]) => ({ type, power });
    return {
        id: seed.id,
        name: seed.name,
        itemType: 'EquipmentItem',
        description: `${seed.name} di prova.`,
        sellPrice: null,
        buyPrice: null,
        rarity: seed.rarity,
        equipType: seed.equipType ?? 'weapon',
        addedSpell: null,
        damages: {
            base: (seed.base ?? []).map(damage),
            energy: (seed.energy ?? []).map(damage),
        },
    };
}

const EQUIPMENT_SEEDS: readonly EquipmentSeed[] = [
    {
        id: ids.shortSword,
        name: 'Spada corta',
        rarity: 'common',
        base: [['cut', 4]],
    },
    {
        id: ids.mace,
        name: 'Mazza ferrata',
        rarity: 'uncommon',
        base: [['blunt', 6]],
    },
    {
        id: ids.torch,
        name: 'Torcia da guerra',
        rarity: 'uncommon',
        base: [['blunt', 2]],
        energy: [['fire', 5]],
    },
    {
        id: ids.flameSword,
        name: 'Spada fiammeggiante',
        rarity: 'rare',
        base: [['cut', 6]],
        energy: [['fire', 10]],
    },
    {
        id: ids.acidAxe,
        name: 'Ascia corrosiva',
        rarity: 'rare',
        energy: [['acid', 8]],
    },
    {
        id: ids.thunderSpear,
        name: 'Lancia del fulmine',
        rarity: 'ultrarare',
        base: [['pierce', 10]],
        energy: [['lightning', 14]],
    },
    {
        id: ids.sunBlade,
        name: 'Lama solare',
        rarity: 'legendary',
        base: [['cut', 10]],
        energy: [['radiant', 20]],
    },
    {
        id: ids.oakShield,
        name: 'Scudo di quercia',
        rarity: 'common',
        equipType: 'shield',
    },
    {
        id: ids.frostHammer,
        name: 'Martello del gelo',
        rarity: 'legendary',
        base: [['blunt', 10]],
        energy: [['cold', 18]],
    },
];

function lootOf(
    id: string,
    name: string,
    rarity: string,
    power: number,
    effect: string,
): Raw {
    return {
        id,
        name,
        itemType: 'LootItem',
        description: `${name} di prova.`,
        sellPrice: null,
        buyPrice: null,
        rarity,
        power,
        effect,
    };
}

export interface GeneratorWorld {
    cities: WorldCity[];
    entries: Record<ContentCollection, Raw[]>;
}

function defaultWorld(): GeneratorWorld {
    const entries = Object.fromEntries(
        CONTENT_COLLECTIONS.map((collection) => [collection, [] as Raw[]]),
    ) as Record<ContentCollection, Raw[]>;
    entries.lore = [
        ...CITY_SEEDS.map(cityLoreOf),
        loreOf(ids.wolfLore, 'animal', 'Lupo'),
        loreOf(ids.bearLore, 'animal', 'Orso'),
        loreOf(ids.monsterLore, 'enemy', 'Ragno gigante'),
    ];
    entries.enemies = ENEMY_SEEDS.map(enemyOf);
    entries.equipmentitems = EQUIPMENT_SEEDS.map(equipmentOf);
    entries.lootitems = [
        lootOf(ids.minorPotion, 'Pozione minore', 'common', 10, 'heal'),
        lootOf(ids.potion, 'Pozione', 'uncommon', 30, 'heal'),
        lootOf(ids.greaterPotion, 'Pozione superiore', 'rare', 80, 'heal'),
        lootOf(ids.elixir, 'Elisir', 'legendary', 200, 'heal'),
        lootOf(ids.ration, 'Razione', 'common', 5, 'hunger'),
        lootOf(ids.driedMeat, 'Carne secca', 'uncommon', 40, 'hunger'),
        lootOf(ids.elvenBread, 'Pane elfico', 'ultrarare', 200, 'hunger'),
        lootOf(ids.lantern, 'Lanterna', 'common', 0, 'exploration'),
        lootOf(ids.rope, 'Corda', 'common', 0, 'exploration'),
        lootOf(ids.climbingKit, 'Kit da scalata', 'uncommon', 0, 'exploration'),
        lootOf(ids.ancientMap, 'Mappa antica', 'legendary', 0, 'exploration'),
    ];
    return { cities: CITY_SEEDS.map(cityOf), entries };
}

export function generatorConfig(): ContentConfig {
    return loadTestContentTree().config!;
}

// albero del generatore in memoria; `edit` lo modifica prima dell'indicizzazione
export function buildGeneratorTree(
    edit?: (world: GeneratorWorld) => void,
): ContentTree {
    const world = defaultWorld();
    edit?.(world);
    const entries = Object.fromEntries(
        CONTENT_COLLECTIONS.map((collection) => [
            collection,
            world.entries[collection].map((raw, index) => ({
                file: `${collection}/generatore.yaml`,
                line: index + 1,
                raw,
            })),
        ]),
    ) as ContentTree['entries'];
    return {
        dir: '',
        entries,
        fixes: [],
        images: { lore: [], enemies: [], pets: [] },
        world: world.cities,
        worldEntries: [],
        config: generatorConfig(),
        issues: [],
        warnings: [],
    };
}

export function buildGeneratorIndex(
    edit?: (world: GeneratorWorld) => void,
): ContentIndex {
    return indexContent(buildGeneratorTree(edit));
}

// factory di id deterministica: i test sanno quali id sono nuovi dal prefisso
export function sequentialIds(): () => string {
    let next = 0;
    return () => {
        next += 1;
        return `${NEW_ID_PREFIX}${next.toString(16).padStart(20, '0')}`;
    };
}

export function withoutEnemies(...enemyIds: string[]) {
    return (world: GeneratorWorld): void => {
        world.entries.enemies = world.entries.enemies.filter(
            (enemy) => !enemyIds.includes(enemy.id as string),
        );
    };
}

export function cityById(index: ContentIndex, id: string): WorldCity {
    const city = index.cities.get(id);
    if (!city) throw new Error(`città di prova assente: ${id}`);
    return city;
}

export function addedMonster(seed: EnemySeed) {
    return (world: GeneratorWorld): void => {
        world.entries.enemies.push(enemyOf(seed));
    };
}

export function addedCity(seed: CitySeed) {
    return (world: GeneratorWorld): void => {
        world.cities.push(cityOf(seed));
        world.entries.lore.push(cityLoreOf(seed));
    };
}

export function addedEquipment(seed: EquipmentSeed) {
    return (world: GeneratorWorld): void => {
        world.entries.equipmentitems.push(equipmentOf(seed));
    };
}

export function generatorInput(
    overrides: Partial<GeneratorInput> = {},
): GeneratorInput {
    return {
        index: buildGeneratorIndex(),
        config: generatorConfig(),
        existingQuests: [],
        newId: sequentialIds(),
        ...overrides,
    };
}

type Section = Record<string, unknown>;

export function infosOf(entry: Raw): Section {
    return entry.infos as Section;
}

export function requirementsOf(entry: Raw): Section {
    return entry.requirements as Section;
}

export function prizesOf(entry: Raw): Section {
    return entry.prizes as Section;
}

export function questsOf(
    result: GeneratorResult,
    type: string,
    city?: string,
): Raw[] {
    return result.quests
        .map((quest) => quest.entry)
        .filter(
            (entry) =>
                infosOf(entry).type === type &&
                (city === undefined || entry.city === city),
        );
}
