import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import {
    priceKey,
    type CatalogPrice,
    type CatalogPrices,
    type TradeItemKind,
    type TradeLine,
} from './trade-line';

interface PricedItem {
    _id: Types.ObjectId;
    buyPrice?: CoinPurse | null;
    sellPrice?: CoinPurse | null;
}

// prezzi autorevoli dal catalogo (04 D-06), letti prima della transazione: qui le letture parallele sono ammesse
@Injectable()
export class CatalogPricesReader {
    constructor(
        @InjectModel(EquipmentItem.name)
        private readonly equipmentItemModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootItemModel: Model<LootItemDocument>,
    ) {}

    async read(lines: readonly TradeLine[]): Promise<CatalogPrices> {
        const [equipment, loot] = await Promise.all([
            readPrices(
                this.equipmentItemModel,
                idsOfKind(lines, 'EquipmentItem'),
            ),
            readPrices(this.lootItemModel, idsOfKind(lines, 'LootItem')),
        ]);
        return new Map([
            ...toEntries('EquipmentItem', equipment),
            ...toEntries('LootItem', loot),
        ]);
    }
}

function idsOfKind(
    lines: readonly TradeLine[],
    kind: TradeItemKind,
): Types.ObjectId[] {
    return lines
        .filter((line) => line.kind === kind)
        .map((line) => line.itemId);
}

// proiezione lean dei soli prezzi, id già validati come ObjectId: nessun CastError su input del client (04 Q6)
async function readPrices<T>(
    model: Model<T>,
    ids: readonly Types.ObjectId[],
): Promise<PricedItem[]> {
    if (ids.length === 0) return [];
    return model
        .find({ _id: { $in: ids } }, { buyPrice: 1, sellPrice: 1 })
        .lean<PricedItem[]>()
        .exec();
}

function toEntries(
    kind: TradeItemKind,
    items: readonly PricedItem[],
): [string, CatalogPrice][] {
    return items.map((item) => [
        priceKey(kind, item._id),
        { buyPrice: item.buyPrice ?? null, sellPrice: item.sellPrice ?? null },
    ]);
}
