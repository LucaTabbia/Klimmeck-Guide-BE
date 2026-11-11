import { Types } from 'mongoose';
import { DEFAULT_LORE_STUDY_CHANCE } from 'src/config/lore-config';
import { CoinPurse, toCopper } from 'src/economy/coins';
import { priceKey } from 'src/economy/trade/trade-line';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { refHexOf } from 'src/lore/lore-visibility';
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
    spellDraw?: unknown;
    pet?: unknown;
    // cura esplicita (Phase 18 D-01): la legge e la sanifica cureOf
    cure?: unknown;
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

// pool ordinato per id esadecimale crescente: gate decide se si impara, roll sceglie fra le imparabili (quick 261111-sdc)
export interface SpellDraw {
    pool: readonly SpellCandidate[];
    gate: number;
    roll: number;
}

// pool dello studio ordinato per id: gate decide se si impara, pick sceglie fra i candidati (Phase 16 D-08)
export interface LoreDraw {
    pool: readonly Types.ObjectId[];
    chance: number;
    gate: number;
    pick: number;
}

export interface DrawnRewards {
    coinsCopper: number;
    xpPrize: number;
    items: RewardItem[];
    spellCandidate: SpellCandidate | null;
    spellDraw: SpellDraw | null;
    pet: Types.ObjectId | null;
    loreDraw: LoreDraw | null;
}

export interface RewardCatalog {
    rarities: ReadonlyMap<string, RarityType | null>;
    spells: ReadonlyMap<string, { minXpToLearn: number; maxUsages: number }>;
    spellPool: readonly SpellCandidate[];
    // hex dei pet esistenti fra quelli in premio (D-21)
    pets: ReadonlySet<string>;
    // solo per una study (Phase 16 D-08, C-3): tutte le lore dei tipi dello studio, il piano le filtra contro lo snapshot
    studyLorePool?: readonly Types.ObjectId[];
    studyLoreChance?: number;
}

export interface RewardRefs {
    items: { itemType: ItemReferenceType; item: Types.ObjectId }[];
    spellId: Types.ObjectId | null;
    petId: Types.ObjectId | null;
}

export const NO_REWARDS: DrawnRewards = {
    coinsCopper: 0,
    xpPrize: 0,
    items: [],
    spellCandidate: null,
    spellDraw: null,
    pet: null,
    loreDraw: null,
};

// «un 20% può andare bene» (D-21)
export const QUEST_PET_WIN_CHANCE = 0.2;

// «vorrei che ci fosse il 30% di probabilità di ottenere una magia» (quick 261111-sdc)
export const SPELL_DRAW_CHANCE = 0.3;

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
    if (!prizes) return { items: [], spellId: null, petId: null };
    return {
        items: validRewardItems(prizes).map(({ itemType, item }) => ({
            itemType,
            item,
        })),
        spellId: refIdOf(prizes.spell),
        petId: refIdOf(prizes.pet),
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

// D-31: tiri dopo quello del loot e solo col booleano true, così le altre quest consumano gli stessi tiri di prima;
// prima il gate e poi la scelta, come lo studio delle lore (quick 261111-sdc)
function spellDrawOf(
    prizes: PrizesSnapshot,
    catalog: RewardCatalog,
    chance: ChanceSource,
): SpellDraw | null {
    if (prizes.spellDraw !== true) return null;
    return {
        pool: catalog.spellPool,
        gate: chance.next(),
        roll: chance.next(),
    };
}

// D-21: tiro dopo loot e magia e solo per un pet a catalogo, così le quest senza pet consumano gli stessi tiri di prima
function petDrawOf(
    prizes: PrizesSnapshot,
    catalog: RewardCatalog,
    chance: ChanceSource,
): Types.ObjectId | null {
    const petId = refIdOf(prizes.pet);
    if (!petId || !catalog.pets.has(petId.toHexString())) return null;
    return chance.next() < QUEST_PET_WIN_CHANCE ? petId : null;
}

// D-08: due tiri dopo loot, magia e pet e solo con pool, così le altre quest consumano gli stessi tiri di prima (Pitfall 5)
function loreDrawOf(
    catalog: RewardCatalog,
    chance: ChanceSource,
): LoreDraw | null {
    const pool = catalog.studyLorePool ?? [];
    if (pool.length === 0) return null;
    return {
        pool,
        chance: catalog.studyLoreChance ?? DEFAULT_LORE_STUDY_CHANCE,
        gate: chance.next(),
        pick: chance.next(),
    };
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
    const spellDraw = spellDrawOf(prizes, catalog, chance);
    const pet = petDrawOf(prizes, catalog, chance);
    const loreDraw = loreDrawOf(catalog, chance);
    return {
        coinsCopper: isNonNegativeInteger(coinsCopper) ? coinsCopper : 0,
        xpPrize: isNonNegativeInteger(prizes.xpPrize) ? prizes.xpPrize : 0,
        items: [prizeItem, rolledLoot].filter(
            (entry): entry is RewardItem => entry !== null,
        ),
        spellCandidate: spellCandidateOf(prizes, catalog),
        spellDraw,
        pet,
        loreDraw,
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

// D-31: stesso cancello di canLearnSpell (xp dopo i premi, magia non nota) applicato a tutto il pool, dopo il gate del 30%
export function drawLearnableSpell(
    draw: SpellDraw | null,
    xpAfter: number,
    knownSpells: readonly unknown[],
): SpellCandidate | null {
    if (!draw || draw.gate >= SPELL_DRAW_CHANCE) return null;
    const learnable = draw.pool.filter(
        (candidate) =>
            candidate.minXpToLearn <= xpAfter &&
            !knownSpells.some((spell) => sameId(spell, candidate.spellId)),
    );
    if (learnable.length === 0) return null;
    // il clamp tiene nel pool un tiro uguale a 1 (fuori dal contratto [0,1) del ChanceSource)
    const index = Math.min(
        learnable.length - 1,
        Math.floor(draw.roll * learnable.length),
    );
    return learnable[index];
}

// D-08, Pitfall 6: esclusi = lore già sbloccate e lore dello stesso esito, confrontate per esadecimale (anche le stringhe legacy)
export function drawStudyLore(
    draw: LoreDraw | null,
    excluded: readonly unknown[],
): Types.ObjectId | null {
    if (!draw || draw.gate >= draw.chance) return null;
    const known = new Set(excluded.map(refHexOf));
    const candidates = draw.pool.filter(
        (lore) => !known.has(lore.toHexString()),
    );
    if (candidates.length === 0) return null;
    // stesso clamp di drawLearnableSpell: un tiro uguale a 1 resta nel pool
    const index = Math.min(
        candidates.length - 1,
        Math.floor(draw.pick * candidates.length),
    );
    return candidates[index];
}
