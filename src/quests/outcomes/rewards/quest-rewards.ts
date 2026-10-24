import { Types } from 'mongoose';
import { CoinPurse } from 'src/economy/coins';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { ChanceSource } from '../chance-source';

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
}

export interface DrawnRewards {
    coinsCopper: number;
    xpPrize: number;
    items: RewardItem[];
    spellCandidate: SpellCandidate | null;
}

export interface RewardCatalog {
    rarities: ReadonlyMap<string, RarityType | null>;
    spells: ReadonlyMap<string, { minXpToLearn: number }>;
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

export function rewardRefsOf(
    prizes: PrizesSnapshot | null | undefined,
): RewardRefs {
    void prizes;
    return { items: [], spellId: null };
}

export function drawRewards(
    prizes: PrizesSnapshot | null | undefined,
    catalog: RewardCatalog,
    chance: ChanceSource,
): DrawnRewards {
    void prizes;
    void catalog;
    void chance;
    return { ...NO_REWARDS, xpPrize: -1 };
}

export function canLearnSpell(
    candidate: SpellCandidate | null,
    xpAfter: number,
    knownSpells: readonly unknown[],
): Types.ObjectId | null {
    void candidate;
    void xpAfter;
    void knownSpells;
    return null;
}
