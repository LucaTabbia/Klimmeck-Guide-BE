import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';

@Injectable()
export class LootItemsService {
    constructor(@InjectModel(LootItem.name) private lootItemModel: Model<LootItemDocument>) { }

    async findAll(): Promise<LootItem[]> {
        return await this.lootItemModel.find().exec();
    }

    async findOne(id: string): Promise<LootItem> {
        const lootItem = await this.lootItemModel.findById(id).exec();
        if (!lootItem) throw new NotFoundException(`LootItem with id ${id} not found`);
        return lootItem;
    }
}
