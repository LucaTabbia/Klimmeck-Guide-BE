import { Types } from 'mongoose';
import { priceKey } from 'src/economy/trade/trade-line';
import { refIdOf } from 'src/mongo/document-id';
import { cureOf } from 'src/quests/outcomes/injuries/quest-cure';
import {
    isNonNegativeInteger,
    PrizesSnapshot,
    RewardCatalog,
    validRewardItems,
} from 'src/quests/outcomes/rewards/quest-rewards';
import {
    MissionPrizeItemRecord,
    MissionPrizeRecord,
} from './mission-draft.model';

// limite tecnico per voce di oggetto dei premi (D-15)
export const MAX_PRIZE_ITEM_QUANTITY = 99;

export interface PrefillInput {
    characterId: Types.ObjectId;
    block: PrizesSnapshot | null;
    catalog: Pick<RewardCatalog, 'rarities' | 'spells' | 'pets'>;
}

const amountOf = (value: unknown): number =>
    isNonNegativeInteger(value) ? value : 0;

function catalogueRefOf(
    value: unknown,
    known: ReadonlyMap<string, unknown>,
): Types.ObjectId | null {
    const id = refIdOf(value);
    return id && known.has(id.toHexString()) ? id : null;
}

// voci a catalogo fuse per oggetto nell'ordine di prima comparsa, quantità col tetto tecnico
function prefilledItemsOf(
    block: PrizesSnapshot,
    rarities: RewardCatalog['rarities'],
): MissionPrizeItemRecord[] {
    const byKey = new Map<string, MissionPrizeItemRecord>();
    for (const entry of validRewardItems(block)) {
        const key = priceKey(entry.itemType, entry.item);
        if (!rarities.has(key)) continue;
        const merged = byKey.get(key);
        const quantity = (merged?.quantity ?? 0) + entry.quantity;
        byKey.set(key, {
            itemType: entry.itemType,
            item: merged?.item ?? entry.item,
            quantity: Math.min(quantity, MAX_PRIZE_ITEM_QUANTITY),
        });
    }
    return [...byKey.values()];
}

// tutto il blocco del titolo del partecipante, l'oste toglie (D-22): voci orfane scartate
export function prefilledPrizeOf({
    characterId,
    block,
    catalog,
}: PrefillInput): MissionPrizeRecord {
    const coins = block?.prizeCoins;
    return {
        character: characterId,
        coins: {
            gold: amountOf(coins?.gold),
            silver: amountOf(coins?.silver),
            copper: amountOf(coins?.copper),
        },
        xp: amountOf(block?.xpPrize),
        items: block ? prefilledItemsOf(block, catalog.rarities) : [],
        pet: catalogueRefOf(block?.pet, catalog.pets),
        spell: catalogueRefOf(block?.spell, catalog.spells),
        cure: cureOf(block?.cure),
    };
}
