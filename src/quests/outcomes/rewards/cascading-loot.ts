import { Types } from 'mongoose';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { ChanceSource } from '../chance-source';

export const DROP_RATES: Readonly<Record<RarityType, number>> = {
    legendary: 0,
    ultrarare: 0,
    rare: 0,
    uncommon: 0,
    common: 0,
};

export const RARITY_ORDER: readonly RarityType[] = [];

export interface LootCandidate {
    itemType: ItemReferenceType;
    item: Types.ObjectId;
    quantity: number;
    rarity: RarityType | null;
}

export function rollLoot<T extends LootCandidate>(
    candidates: readonly T[],
    chance: ChanceSource,
): T | null {
    void candidates;
    void chance;
    return null;
}
