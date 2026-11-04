import { CoinPurse, fromCopper } from 'src/economy/coins';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { GeneratedRank } from 'src/quests/generation/generation-rules';

export type GeneratedQuestType = QuestType.enemy | QuestType.boss;

// voce del catalogo letta lean dal generatore (13-13): rarità ed effetto non tipizzati, curati a mano a DB
export interface PrizeCatalogItem {
    itemType: ItemReferenceType;
    id: string;
    rarity: string | null;
    effect?: string | null;
    power?: number | null;
    equipType?: string | null;
    damages?: unknown;
}

// già filtrati sellable: false dal servizio (D-21)
export interface PetCandidate {
    id: string;
}

export interface GeneratedAssetRef {
    itemType: ItemReferenceType;
    item: string;
    quantity: 1;
}

export interface GeneratedPrizes {
    prizeCoins: CoinPurse;
    xpPrize: number;
    randomLoot: GeneratedAssetRef[];
    pet: string | null;
}

export interface PrizesInput {
    type: GeneratedQuestType;
    rank: GeneratedRank;
    catalog: readonly PrizeCatalogItem[];
    pets: readonly PetCandidate[];
    chance: ChanceSource;
}

export interface LootSlot {
    rarity: RarityType;
    min: number;
    max: number;
}

// monete in rame e XP base come le fisse (D-19); × moltiplicatore del rango; ritoccabili
export const GENERATED_PRIZES: Readonly<
    Record<GeneratedQuestType, { copper: number; xp: number }>
> = {
    [QuestType.enemy]: { copper: 150, xp: 40 },
    [QuestType.boss]: { copper: 600, xp: 120 },
};

// Phase 11 tierMultiplier; legend come hero (confermato dall'utente il 2026-11-04, D-19)
export const TIER_MULTIPLIER: Readonly<Record<GeneratedRank, number>> = {
    rookie: 1,
    adventurer: 2,
    paladin: 5,
    mage: 12,
    hero: 25,
    legend: 25,
};

const slot = (rarity: RarityType, min: number, max = min): LootSlot => ({
    rarity,
    min,
    max,
});

const HERO_BOSS_POOL: readonly LootSlot[] = [
    slot(RarityType.legendary, 1),
    slot(RarityType.ultrarare, 2),
    slot(RarityType.rare, 4),
];

// pool ampi per tipo e rango (D-20): legendary solo da hero in su; enemy legend = boss hero (utente 2026-11-04); legend senza boss
export const LOOT_POOLS: Readonly<
    Record<
        GeneratedQuestType,
        Readonly<Record<GeneratedRank, readonly LootSlot[]>>
    >
> = {
    [QuestType.boss]: {
        hero: HERO_BOSS_POOL,
        mage: [
            slot(RarityType.ultrarare, 1),
            slot(RarityType.rare, 2),
            slot(RarityType.uncommon, 4),
        ],
        paladin: [
            slot(RarityType.rare, 1),
            slot(RarityType.uncommon, 2),
            slot(RarityType.common, 4),
        ],
        adventurer: [slot(RarityType.uncommon, 1), slot(RarityType.common, 4)],
        rookie: [slot(RarityType.common, 2)],
        legend: [],
    },
    [QuestType.enemy]: {
        legend: HERO_BOSS_POOL,
        hero: [slot(RarityType.ultrarare, 1), slot(RarityType.rare, 2)],
        mage: [slot(RarityType.rare, 1), slot(RarityType.uncommon, 2)],
        paladin: [slot(RarityType.uncommon, 1), slot(RarityType.common, 2)],
        adventurer: [slot(RarityType.common, 1, 2)],
        rookie: [slot(RarityType.common, 1, 2)],
    },
};

// «probabilità estremamente bassa» (D-21)
export const BOSS_PET_PRIZE_CHANCE = 0.01;

const RARITY_RANK: Readonly<Record<RarityType, number>> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    ultrarare: 3,
    legendary: 4,
};

// da rare in su niente effect hunger (D-20)
const FOOD_FREE_FROM: RarityType = RarityType.rare;

const indexOf = (length: number, chance: ChanceSource): number =>
    Math.min(length - 1, Math.floor(chance.next() * length));

const byTypeThenId = (a: PrizeCatalogItem, b: PrizeCatalogItem): number =>
    a.itemType.localeCompare(b.itemType) || a.id.localeCompare(b.id);

const isFood = (item: PrizeCatalogItem): boolean =>
    item.effect === EffectType.hunger;

function candidatesOf(
    catalog: readonly PrizeCatalogItem[],
    rarity: RarityType,
): PrizeCatalogItem[] {
    const foodFree = RARITY_RANK[rarity] >= RARITY_RANK[FOOD_FREE_FROM];
    return catalog
        .filter((item) => item.rarity === rarity)
        .filter((item) => !(foodFree && isFood(item)))
        .sort(byTypeThenId);
}

function countOf(lootSlot: LootSlot, chance: ChanceSource): number {
    if (lootSlot.min >= lootSlot.max) return lootSlot.min;
    const span = lootSlot.max - lootSlot.min + 1;
    return lootSlot.min + Math.floor(chance.next() * span);
}

// estrazione senza ripetizioni; uno slot si restringe a quanto il catalogo offre
function drawSlot(
    lootSlot: LootSlot,
    catalog: readonly PrizeCatalogItem[],
    chance: ChanceSource,
): GeneratedAssetRef[] {
    const count = countOf(lootSlot, chance);
    const remaining = candidatesOf(catalog, lootSlot.rarity);
    const drawn: GeneratedAssetRef[] = [];
    while (drawn.length < count && remaining.length > 0) {
        const [item] = remaining.splice(indexOf(remaining.length, chance), 1);
        drawn.push({ itemType: item.itemType, item: item.id, quantity: 1 });
    }
    return drawn;
}

function petOf(
    type: GeneratedQuestType,
    pets: readonly PetCandidate[],
    chance: ChanceSource,
): string | null {
    if (type !== QuestType.boss) return null;
    if (chance.next() >= BOSS_PET_PRIZE_CHANCE) return null;
    if (pets.length === 0) return null;
    const sorted = [...pets].sort((a, b) => a.id.localeCompare(b.id));
    return sorted[indexOf(sorted.length, chance)].id;
}

export function prizesOf(input: PrizesInput): GeneratedPrizes {
    const { type, rank, catalog, pets, chance } = input;
    const base = GENERATED_PRIZES[type];
    const multiplier = TIER_MULTIPLIER[rank];
    const randomLoot = LOOT_POOLS[type][rank].flatMap((lootSlot) =>
        drawSlot(lootSlot, catalog, chance),
    );
    return {
        prizeCoins: fromCopper(base.copper * multiplier),
        xpPrize: base.xp * multiplier,
        randomLoot,
        pet: petOf(type, pets, chance),
    };
}
