import { EffectType } from 'src/models/enums/effect-type.enum';
import { EquipType } from 'src/models/enums/equip-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GeneratedAssetRef,
    PrizeCatalogItem,
    RARITY_RANK,
} from 'src/quests/generation/generated-prizes';
import { GeneratedRank } from 'src/quests/generation/generation-rules';

// rarità massima dei consigliati per fascia, come dungeonLootRarity della Phase 11 (D-27); legend come hero
export const RECOMMENDED_LOOT_RARITY: Readonly<
    Record<GeneratedRank, RarityType>
> = {
    rookie: RarityType.common,
    adventurer: RarityType.uncommon,
    paladin: RarityType.rare,
    mage: RarityType.ultrarare,
    hero: RarityType.legendary,
    legend: RarityType.legendary,
};

export const RECOMMENDED_WEAPONS = 2;

export interface RecommendedLootInput {
    rank: GeneratedRank;
    enemies: readonly EnemyCandidate[];
    catalog: readonly PrizeCatalogItem[];
}

interface Damage {
    type: unknown;
    power: unknown;
}

const byId = (a: PrizeCatalogItem, b: PrizeCatalogItem): number =>
    a.id.localeCompare(b.id);

const refOf = (item: PrizeCatalogItem): GeneratedAssetRef => ({
    itemType: item.itemType,
    item: item.id,
    quantity: 1,
});

const listOf = (value: unknown): Damage[] =>
    Array.isArray(value) ? (value as Damage[]) : [];

const numberOf = (value: unknown): number =>
    typeof value === 'number' ? value : 0;

function rankOf(rarity: string | null): number | null {
    return rarity !== null && Object.hasOwn(RARITY_RANK, rarity)
        ? RARITY_RANK[rarity as RarityType]
        : null;
}

function withinRarity(item: PrizeCatalogItem, maxRank: number): boolean {
    const rank = rankOf(item.rarity);
    return rank !== null && rank <= maxRank;
}

function weaknessesOf(enemies: readonly EnemyCandidate[]): Set<string> {
    return new Set(
        enemies.flatMap((enemy) => [
            ...enemy.baseWeaknesses,
            ...enemy.energyWeaknesses,
        ]),
    );
}

function damagesOf(item: PrizeCatalogItem): Damage[] {
    const damages = item.damages as
        | { base?: unknown; energy?: unknown }
        | null
        | undefined;
    return [...listOf(damages?.base), ...listOf(damages?.energy)];
}

function usefulPower(
    item: PrizeCatalogItem,
    weaknesses: ReadonlySet<string>,
): number {
    return damagesOf(item)
        .filter(
            (damage) =>
                typeof damage.type === 'string' && weaknesses.has(damage.type),
        )
        .reduce((total, damage) => total + numberOf(damage.power), 0);
}

// i damages di un equipaggiamento non-arma indicano la protezione, non l'attacco (Phase 11 D-33)
const isWeapon = (item: PrizeCatalogItem): boolean =>
    item.itemType === 'EquipmentItem' && item.equipType === EquipType.weapon;

function weaponsAgainst(
    enemies: readonly EnemyCandidate[],
    catalog: readonly PrizeCatalogItem[],
    maxRank: number,
): GeneratedAssetRef[] {
    const weaknesses = weaknessesOf(enemies);
    return catalog
        .filter((item) => isWeapon(item) && withinRarity(item, maxRank))
        .map((item) => ({ item, power: usefulPower(item, weaknesses) }))
        .filter(({ power }) => power > 0)
        .sort((a, b) => b.power - a.power || byId(a.item, b.item))
        .slice(0, RECOMMENDED_WEAPONS)
        .map(({ item }) => refOf(item));
}

function bestHealingOf(
    catalog: readonly PrizeCatalogItem[],
    maxRank: number,
): GeneratedAssetRef[] {
    const [best] = catalog
        .filter(
            (item) =>
                item.itemType === 'LootItem' &&
                item.effect === EffectType.heal &&
                withinRarity(item, maxRank),
        )
        .sort((a, b) => numberOf(b.power) - numberOf(a.power) || byId(a, b));
    return best ? [refOf(best)] : [];
}

// i consumabili contro i damages dei nemici non hanno dati strutturati (EffectType): restano fuori come nella Phase 11
export function recommendedLootOf(
    input: RecommendedLootInput,
): GeneratedAssetRef[] {
    const maxRank = RARITY_RANK[RECOMMENDED_LOOT_RARITY[input.rank]];
    return [
        ...weaponsAgainst(input.enemies, input.catalog, maxRank),
        ...bestHealingOf(input.catalog, maxRank),
    ];
}
