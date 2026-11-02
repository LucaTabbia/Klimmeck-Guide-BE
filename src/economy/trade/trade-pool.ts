import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { sameId } from 'src/mongo/document-id';
import { isShelfEligible, type ShopPoolLists } from 'src/shops/shop-pool.rules';
import {
    priceKey,
    type CatalogPrices,
    type TradeItemKind,
    type TradeLine,
} from './trade-line';

export interface CityPool {
    equipment: readonly unknown[];
    loot: readonly unknown[];
    pets: readonly unknown[];
}

// la proiezione della città letta in sessione: le stesse liste di hasShopOf
export type CityPoolDocument = ShopPoolLists;

const POOL_LIST = {
    EquipmentItem: 'equipment',
    LootItem: 'loot',
    Pet: 'pets',
} as const satisfies Record<TradeItemKind, keyof CityPool>;

// una città non seminata vende nulla: le liste assenti valgono vuote
export function poolOfCity(city: CityPoolDocument): CityPool {
    return {
        equipment: city.shopEquipment ?? [],
        loot: city.shopLoot ?? [],
        pets: city.shopPets ?? [],
    };
}

// solo gli acquisti: fuori dal pool del marker, leggendario o sellable false → ITEM_NOT_IN_SHOP; la vendita resta libera ovunque (D-05, D-11, D-19)
export function assertBuysInShop(
    lines: readonly TradeLine[],
    pool: CityPool,
    catalogue: CatalogPrices,
): void {
    for (const line of lines) {
        if (line.direction !== 'buy') continue;
        const inPool = pool[POOL_LIST[line.kind]].some((id) =>
            sameId(id, line.itemId),
        );
        const entry = catalogue.get(priceKey(line.kind, line.itemId));
        if (!inPool || !entry || !isShelfEligible(entry)) {
            throw GameRuleException.itemNotInShop();
        }
    }
}
