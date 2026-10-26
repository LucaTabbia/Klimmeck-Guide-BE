import { Types } from 'mongoose';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { ChanceSource } from '../chance-source';

// drop rate per rarità: default tecnico provvisorio (D-02, D-16, esempio dell'utente legendary 2%)
export const DROP_RATES: Readonly<Record<RarityType, number>> = {
    legendary: 0.02,
    ultrarare: 0.05,
    rare: 0.15,
    uncommon: 0.35,
    common: 0.6,
};

export const RARITY_ORDER: readonly RarityType[] = [
    RarityType.legendary,
    RarityType.ultrarare,
    RarityType.rare,
    RarityType.uncommon,
    RarityType.common,
];

export interface LootCandidate {
    itemType: ItemReferenceType;
    item: Types.ObjectId;
    quantity: number;
    rarity: RarityType | null;
}

// cascading rolls (D-16): dalla rarità più alta presente in giù, al massimo un oggetto; rarità assente sull'item = common
export function rollLoot<T extends LootCandidate>(
    candidates: readonly T[],
    chance: ChanceSource,
): T | null {
    for (const rarity of RARITY_ORDER) {
        const pool = candidates.filter(
            (entry) => (entry.rarity ?? RarityType.common) === rarity,
        );
        if (pool.length === 0) continue;
        if (chance.next() >= DROP_RATES[rarity]) continue;
        if (pool.length === 1) return pool[0];
        return pool[
            Math.min(pool.length - 1, Math.floor(chance.next() * pool.length))
        ];
    }
    return null;
}
