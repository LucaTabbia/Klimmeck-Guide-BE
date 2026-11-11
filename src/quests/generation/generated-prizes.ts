import { CoinPurse, fromCopper } from 'src/economy/coins';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { GeneratedRank } from 'src/quests/generation/generation-rules';
import {
    indexOf,
    LOOT_POOLS,
    RARITY_RANK,
    type GeneratedQuestType,
    type LootSlot,
} from 'src/quests/generation/loot-pools';
import { petPrizeOf, type PetCandidate } from 'src/quests/generation/pet-prize';

export {
    LOOT_POOLS,
    RARITY_RANK,
    type GeneratedQuestType,
    type LootSlot,
} from 'src/quests/generation/loot-pools';

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
    // nemici della quest e tipi del suo POI: legano il pet in premio (Phase 19 D-28)
    enemyIds: readonly string[];
    poiTypes: readonly string[];
    chance: ChanceSource;
}

// monete in rame e XP base come le fisse (D-19); × moltiplicatore del rango; ritoccabili
export const GENERATED_PRIZES: Readonly<
    Record<GeneratedQuestType, { copper: number; xp: number }>
> = {
    [QuestType.enemy]: { copper: 150, xp: 40 },
    [QuestType.boss]: { copper: 600, xp: 120 },
};

// Phase 11 tierMultiplier (D-19)
export const TIER_MULTIPLIER: Readonly<Record<GeneratedRank, number>> = {
    rookie: 1,
    adventurer: 2,
    paladin: 5,
    mage: 12,
    hero: 25,
};

// da rare in su niente effect hunger (D-20)
const FOOD_FREE_FROM: RarityType = RarityType.rare;

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

// ordine dei tiri (le spec a seme fisso ne dipendono): il loot slot per slot, poi per OGNI quest generata
// un tiro di fascia del pet, più l'indice se la fascia colpita ha candidati (Phase 19 D-28)
export function prizesOf(input: PrizesInput): GeneratedPrizes {
    const { type, rank, catalog, pets, enemyIds, poiTypes, chance } = input;
    const base = GENERATED_PRIZES[type];
    const multiplier = TIER_MULTIPLIER[rank];
    const randomLoot = LOOT_POOLS[type][rank].flatMap((lootSlot) =>
        drawSlot(lootSlot, catalog, chance),
    );
    return {
        prizeCoins: fromCopper(base.copper * multiplier),
        xpPrize: base.xp * multiplier,
        randomLoot,
        pet: petPrizeOf({ type, rank, pets, enemyIds, poiTypes, chance }),
    };
}
