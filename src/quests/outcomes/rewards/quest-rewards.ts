import { Types } from 'mongoose';
import { CoinPurse, toCopper } from 'src/economy/coins';
import { priceKey } from 'src/economy/trade/trade-line';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { refIdOf, sameId } from 'src/mongo/document-id';
import { ChanceSource } from '../chance-source';
import { rollLoot } from './cascading-loot';

export interface PrizeEntrySnapshot {
    itemType?: unknown;
    item?: unknown;
    quantity?: unknown;
}

export interface PrizesSnapshot {
    prizeCoins?: Partial<CoinPurse> | null;
    xpPrize?: unknown;
    prizeItem?: PrizeEntrySnapshot | null;
    randomLoot?: PrizeEntrySnapshot[] | null;
    spell?: unknown;
}

export interface RewardItem {
    itemType: ItemReferenceType;
    item: Types.ObjectId;
    quantity: number;
}

export interface SpellCandidate {
    spellId: Types.ObjectId;
    minXpToLearn: number;
    maxUsages: number;
}

export interface DrawnRewards {
    coinsCopper: number;
    xpPrize: number;
    items: RewardItem[];
    spellCandidate: SpellCandidate | null;
}

export interface RewardCatalog {
    rarities: ReadonlyMap<string, RarityType | null>;
    spells: ReadonlyMap<string, { minXpToLearn: number; maxUsages: number }>;
}

export interface RewardRefs {
    items: { itemType: ItemReferenceType; item: Types.ObjectId }[];
    spellId: Types.ObjectId | null;
}

export const NO_REWARDS: DrawnRewards = {
    coinsCopper: 0,
    xpPrize: 0,
    items: [],
    spellCandidate: null,
};

const REWARD_ITEM_TYPES: readonly unknown[] = [
    'EquipmentItem',
    'LootItem',
] satisfies ItemReferenceType[];

const isNonNegativeInteger = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) >= 0;

// premi scritti a mano nel catalogo (D-16, T-09-11): tipo dell'enum, ref valido, quantità intera ≥ 1, altrimenti scartato
function rewardItemOf(
    entry: PrizeEntrySnapshot | null | undefined,
): RewardItem | null {
    if (!entry || !REWARD_ITEM_TYPES.includes(entry.itemType)) return null;
    const item = refIdOf(entry.item);
    if (!item) return null;
    if (!isNonNegativeInteger(entry.quantity) || entry.quantity < 1) {
        return null;
    }
    return {
        itemType: entry.itemType as ItemReferenceType,
        item,
        quantity: entry.quantity,
    };
}

function validRewardItems(prizes: PrizesSnapshot): RewardItem[] {
    return [prizes.prizeItem, ...(prizes.randomLoot ?? [])]
        .map(rewardItemOf)
        .filter((entry): entry is RewardItem => entry !== null);
}

// per le pre-letture del catalogo: solo le voci formalmente valide
export function rewardRefsOf(
    prizes: PrizesSnapshot | null | undefined,
): RewardRefs {
    if (!prizes) return { items: [], spellId: null };
    return {
        items: validRewardItems(prizes).map(({ itemType, item }) => ({
            itemType,
            item,
        })),
        spellId: refIdOf(prizes.spell),
    };
}

const catalogKeyOf = ({ itemType, item }: RewardItem): string =>
    priceKey(itemType, item);

function catalogued(
    entry: RewardItem | null,
    catalog: RewardCatalog,
): RewardItem | null {
    return entry && catalog.rarities.has(catalogKeyOf(entry)) ? entry : null;
}

function rolledLootOf(
    prizes: PrizesSnapshot,
    catalog: RewardCatalog,
    chance: ChanceSource,
): RewardItem | null {
    const candidates = (prizes.randomLoot ?? [])
        .map((entry) => catalogued(rewardItemOf(entry), catalog))
        .filter((entry): entry is RewardItem => entry !== null)
        .map((entry) => ({
            ...entry,
            rarity: catalog.rarities.get(catalogKeyOf(entry)) ?? null,
        }));
    const rolled = rollLoot(candidates, chance);
    if (!rolled) return null;
    const { itemType, item, quantity } = rolled;
    return { itemType, item, quantity };
}

function spellCandidateOf(
    prizes: PrizesSnapshot,
    catalog: RewardCatalog,
): SpellCandidate | null {
    const spellId = refIdOf(prizes.spell);
    const spell = spellId && catalog.spells.get(spellId.toHexString());
    return spellId && spell
        ? {
              spellId,
              minXpToLearn: spell.minXpToLearn,
              maxUsages: spell.maxUsages,
          }
        : null;
}

// premi della quest vinta (D-16, D-17): voci orfane o malformate scartate, mai un'eccezione (T-09-12)
export function drawRewards(
    prizes: PrizesSnapshot | null | undefined,
    catalog: RewardCatalog,
    chance: ChanceSource,
): DrawnRewards {
    if (!prizes) return NO_REWARDS;
    const coinsCopper = toCopper(prizes.prizeCoins);
    const prizeItem = catalogued(rewardItemOf(prizes.prizeItem), catalog);
    const rolledLoot = rolledLootOf(prizes, catalog, chance);
    return {
        coinsCopper: isNonNegativeInteger(coinsCopper) ? coinsCopper : 0,
        xpPrize: isNonNegativeInteger(prizes.xpPrize) ? prizes.xpPrize : 0,
        items: [prizeItem, rolledLoot].filter(
            (entry): entry is RewardItem => entry !== null,
        ),
        spellCandidate: spellCandidateOf(prizes, catalog),
    };
}

// D-17: l'XP si valuta dopo xpPrize (lo passa il chiamante); nessun controllo di città qui
export function canLearnSpell(
    candidate: SpellCandidate | null,
    xpAfter: number,
    knownSpells: readonly unknown[],
): Types.ObjectId | null {
    if (!candidate || xpAfter < candidate.minXpToLearn) return null;
    return knownSpells.some((spell) => sameId(spell, candidate.spellId))
        ? null
        : candidate.spellId;
}
