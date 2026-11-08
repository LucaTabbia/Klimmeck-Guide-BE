import type { Types } from 'mongoose';
import { LoreType } from 'src/models/enums/lore-type.enum';

// geografia di una città (Phase 16 D-03): la lore della città più le sue relatedLore di tipo region e state; nessuna cascata; una sola funzione per nascita, arrivo e backfill

export const GEOGRAPHY_LORE_TYPES: readonly LoreType[] = [
    LoreType.region,
    LoreType.state,
];

export interface GeographyLore {
    _id: Types.ObjectId;
    type?: unknown;
}

const isGeography = (lore: GeographyLore): boolean =>
    GEOGRAPHY_LORE_TYPES.includes(lore.type as LoreType);

export function geographyOf(
    cityLore: GeographyLore | null,
    related: readonly GeographyLore[],
): Types.ObjectId[] {
    if (!cityLore) return [];
    const ids = [
        cityLore._id,
        ...related.filter(isGeography).map((lore) => lore._id),
    ];
    return uniqueByHex(ids);
}

function uniqueByHex(ids: readonly Types.ObjectId[]): Types.ObjectId[] {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const hex = id.toHexString();
        if (seen.has(hex)) return false;
        seen.add(hex);
        return true;
    });
}
