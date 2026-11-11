import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { cityRelations } from 'src/cities/city-relations';
import { City, CityDocument } from 'src/models/city.model';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { CityShop } from 'src/models/shop/city-shop.model';
import { refIdOf } from 'src/mongo/document-id';
import { ShelfFlags, shelfInPoolOrder } from './shop-pool.rules';

type PoolList = readonly unknown[] | null | undefined;

// sola lettura fuori transazione: i pool non sono segreti, il guard autorevole è doTransaction (D-18, D-19)
@Injectable()
export class CityShopService {
    constructor(
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
        @InjectModel(EquipmentItem.name)
        private readonly equipmentModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootModel: Model<LootItemDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    ) {}

    async read(cityId: string): Promise<CityShop> {
        const city = await this.cityModel
            .findById(cityId)
            .populate(cityRelations())
            .exec();
        if (!city) throw ResourceNotFoundException.city();
        const pool = city.shop;
        const [equipment, loot, pets] = await Promise.all([
            this.shelve<EquipmentItem>(
                this.equipmentModel,
                pool?.equipment,
                'addedSpell',
            ),
            this.shelve<LootItem>(this.lootModel, pool?.loot),
            this.shelve<Pet>(this.petModel, pool?.pets),
        ]);
        // quantità 1 solo forma: scorte infinite (D-12); veti solo D-05, nessun filtro di taglia (la mano vince)
        return {
            city,
            equipment: equipment.map(
                (item): AssetQuantity => ({
                    itemType: 'EquipmentItem',
                    item,
                    quantity: 1,
                }),
            ),
            loot: loot.map(
                (item): AssetQuantity => ({
                    itemType: 'LootItem',
                    item,
                    quantity: 1,
                }),
            ),
            pets,
        };
    }

    private async shelve<T extends ShelfFlags>(
        model: Model<any>,
        pool: PoolList,
        populate?: string,
    ): Promise<T[]> {
        const ids = (pool ?? []).flatMap((raw) => refIdOf(raw) ?? []);
        if (ids.length === 0) return [];
        const query = model.find({ _id: { $in: ids } });
        const items = (await (
            populate ? query.populate(populate) : query
        ).exec()) as (T & { _id: Types.ObjectId })[];
        return shelfInPoolOrder(pool, items);
    }
}
