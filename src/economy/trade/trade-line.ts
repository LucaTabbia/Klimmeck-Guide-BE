import type { Types } from 'mongoose';
import type { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import type { CoinPurse } from '../coins';

// i pet non sono AssetQuantity: niente refPath, niente quantità (D-17)
export type TradeItemKind = ItemReferenceType | 'Pet';
export type TradeDirection = 'buy' | 'sell';

export interface TradeLine {
    readonly direction: TradeDirection;
    readonly kind: TradeItemKind;
    readonly itemId: Types.ObjectId;
    readonly quantity: number;
}

export interface CatalogPrice {
    buyPrice?: CoinPurse | null;
    sellPrice?: CoinPurse | null;
    // veto letto insieme ai prezzi (D-23)
    rarity?: string | null;
    sellable?: boolean | null;
}

export type CatalogPrices = ReadonlyMap<string, CatalogPrice>;

export const INVENTORY_FIELD = {
    EquipmentItem: 'ownedEquipments',
    LootItem: 'ownedItems',
} as const satisfies Record<ItemReferenceType, string>;

export type InventoryTradeLine = TradeLine & {
    readonly kind: ItemReferenceType;
};

export const isInventoryLine = (line: TradeLine): line is InventoryTradeLine =>
    line.kind !== 'Pet';

export const priceKey = (
    kind: TradeItemKind,
    itemId: Types.ObjectId | string,
): string => `${kind}:${itemId.toString()}`;
