import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';

@Injectable()
export class LootItemsService {
    constructor(@InjectModel(LootItem.name) private lootItemModel: Model<LootItemDocument>) { }

    async findAll(): Promise<LootItem[]> {
        return await this.lootItemModel.find().exec();
    }

    async findAllAssetsQuantity(): Promise<AssetQuantity[]> {
        let loots = await this.lootItemModel.find().exec();

        const assetsQuantity: AssetQuantity[] = loots.map((loot) => ({
            itemType: 'LootItem',
            item: loot,
            quantity: 0,
        }));

        return assetsQuantity
    }

    async findOne(id: string): Promise<LootItem> {
        const lootItem = await this.lootItemModel.findById(id).exec();
        if (!lootItem) throw new NotFoundException(`LootItem with id ${id} not found`);
        return lootItem;
    }

    async findByIds(ids: string[]): Promise<LootItem[]> {
        const lootItems = await this.lootItemModel.find({ _id: { $in: ids } }).exec();
        return lootItems;
    }
}
