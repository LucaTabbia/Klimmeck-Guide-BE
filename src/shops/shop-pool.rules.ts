import { Types } from 'mongoose';
import { CitySize } from 'src/models/enums/city-size.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { SHOP_RARITY_WEIGHTS, TierWeight } from './shop-pool.constants';

export interface ShopPoolLists {
    shopEquipment?: readonly unknown[] | null;
    shopLoot?: readonly unknown[] | null;
    shopPets?: readonly unknown[] | null;
}

// pool grezzo: almeno una lista non vuota apre il negozio; Necrorian e le città non seminate restano chiuse (D-04)
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

export function allowedRaritiesOf(size: CitySize): RarityType[] {
    const weights: readonly TierWeight[] = SHOP_RARITY_WEIGHTS[size];
    return weights.map(({ rarity }) => rarity);
}

export interface SeedCandidate extends ShelfFlags {
    _id: Types.ObjectId;
    buyPrice?: unknown;
    effect?: string | null;
}

// la regola di taglia guida solo la semina (D-05, D-08): un oggetto senza prezzo darebbe ITEM_NOT_TRADABLE
export function isSeedCandidate(item: SeedCandidate, size: CitySize): boolean {
    return (
        isShelfEligible(item) &&
        item.buyPrice != null &&
        allowedRaritiesOf(size).some((rarity) => rarity === item.rarity)
    );
}
