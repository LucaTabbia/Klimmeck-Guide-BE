import { Types } from 'mongoose';
import { CitySize } from 'src/models/enums/city-size.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { refIdOf } from 'src/mongo/document-id';
import { SHOP_ALLOWED_RARITIES } from './shop-pool.constants';

export interface ShopPoolLists {
    shopEquipment?: readonly unknown[] | null;
    shopLoot?: readonly unknown[] | null;
    shopPets?: readonly unknown[] | null;
}

// pool grezzo: almeno una lista non vuota apre il negozio; Necrorian e le città senza pool restano chiuse (D-04)
export function hasShopOf(city: ShopPoolLists): boolean {
    return [city.shopEquipment, city.shopLoot, city.shopPets].some(
        (list) => (list?.length ?? 0) > 0,
    );
}

export interface ShelfFlags {
    rarity?: string | null;
    sellable?: boolean | null;
}

// veto assoluto, indipendente dal DB: legendary e sellable false mai sullo scaffale; sellable assente vale vendibile (D-05, A1)
export function isShelfEligible(item: ShelfFlags): boolean {
    return item.rarity !== RarityType.legendary && item.sellable !== false;
}

// ordine della lista a DB (la cura decide), id curati come stringa tollerati; serviti solo gli ammessi da D-05, senza ripetizioni
export function shelfInPoolOrder<
    T extends ShelfFlags & { _id: Types.ObjectId },
>(poolIds: readonly unknown[] | null | undefined, items: readonly T[]): T[] {
    const byHex = new Map(items.map((item) => [item._id.toHexString(), item]));
    const served = new Set<string>();
    return (poolIds ?? []).flatMap((raw) => {
        const hex = refIdOf(raw)?.toHexString();
        if (hex === undefined || served.has(hex)) return [];
        const item = byHex.get(hex);
        if (!item || !isShelfEligible(item)) return [];
        served.add(hex);
        return [item];
    });
}

export function allowedRaritiesOf(size: CitySize): readonly RarityType[] {
    return SHOP_ALLOWED_RARITIES[size];
}
