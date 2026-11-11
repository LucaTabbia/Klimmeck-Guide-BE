import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { relatedLoreIdsOf } from 'src/lore/related-lore-ids';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import {
    priceKey,
    type CatalogPrice,
    type CatalogPrices,
    type TradeItemKind,
    type TradeLine,
} from './trade-line';
import type { PetLifePoints, PetLore } from './trade-pets';

interface PricedItem {
    _id: Types.ObjectId;
    buyPrice?: CoinPurse | null;
    sellPrice?: CoinPurse | null;
    rarity?: string | null;
    sellable?: boolean | null;
}

interface PricedPet extends PricedItem {
    maxLifePoints?: unknown;
    relatedLore?: unknown;
}

// i prezzi di ogni riga e, per i pet, la vita massima da cui parte la voce comprata (Phase 19 D-03) e le lore che il pet sblocca (D-26)
export interface CatalogReading {
    prices: CatalogPrices;
    petLifePoints: PetLifePoints;
    petLore: PetLore;
}

const PRICE_PROJECTION = { buyPrice: 1, sellPrice: 1, rarity: 1, sellable: 1 };
const PET_PROJECTION = {
    ...PRICE_PROJECTION,
    maxLifePoints: 1,
    relatedLore: 1,
};

// prezzi e veto (D-23) autorevoli dal catalogo (04 D-06), letti prima della transazione: qui le letture parallele sono ammesse
@Injectable()
export class CatalogPricesReader {
    constructor(
        @InjectModel(EquipmentItem.name)
        private readonly equipmentItemModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootItemModel: Model<LootItemDocument>,
        @InjectModel(Pet.name)
        private readonly petModel: Model<PetDocument>,
    ) {}

    async read(lines: readonly TradeLine[]): Promise<CatalogReading> {
        const [equipment, loot, pets] = await Promise.all([
            readPrices<PricedItem>(
                this.equipmentItemModel,
                idsOfKind(lines, 'EquipmentItem'),
                PRICE_PROJECTION,
            ),
            readPrices<PricedItem>(
                this.lootItemModel,
                idsOfKind(lines, 'LootItem'),
                PRICE_PROJECTION,
            ),
            readPrices<PricedPet>(
                this.petModel,
                idsOfKind(lines, 'Pet'),
                PET_PROJECTION,
            ),
        ]);
        return {
            prices: new Map([
                ...toEntries('EquipmentItem', equipment),
                ...toEntries('LootItem', loot),
                ...toEntries('Pet', pets),
            ]),
            petLifePoints: new Map(
                pets.map((pet) => [pet._id.toHexString(), pet.maxLifePoints]),
            ),
            petLore: new Map(
                pets.map((pet) => [
                    pet._id.toHexString(),
                    relatedLoreIdsOf(pet.relatedLore),
                ]),
            ),
        };
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

// proiezione lean dei soli prezzi e flag di veto, id già validati come ObjectId: nessun CastError su input del client (04 Q6)
async function readPrices<Priced extends PricedItem>(
    model: Model<any>,
    ids: readonly Types.ObjectId[],
    projection: Record<string, number>,
): Promise<Priced[]> {
    if (ids.length === 0) return [];
    return model
        .find({ _id: { $in: ids } }, projection)
        .lean<Priced[]>()
        .exec();
}

function toEntries(
    kind: TradeItemKind,
    items: readonly PricedItem[],
): [string, CatalogPrice][] {
    return items.map((item) => [
        priceKey(kind, item._id),
        {
            buyPrice: item.buyPrice ?? null,
            sellPrice: item.sellPrice ?? null,
            rarity: item.rarity ?? null,
            sellable: item.sellable ?? null,
        },
    ]);
}
