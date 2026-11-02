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
