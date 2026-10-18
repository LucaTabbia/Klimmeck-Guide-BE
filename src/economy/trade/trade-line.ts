import type { Types } from 'mongoose';
import type { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import type { CoinPurse } from '../coins';

export type TradeItemKind = ItemReferenceType;
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
}

export type CatalogPrices = ReadonlyMap<string, CatalogPrice>;

export const INVENTORY_FIELD = {
    EquipmentItem: 'ownedEquipments',
    LootItem: 'ownedItems',
} as const satisfies Record<TradeItemKind, string>;

export const priceKey = (
    kind: TradeItemKind,
    itemId: Types.ObjectId | string,
): string => `${kind}:${itemId.toString()}`;
