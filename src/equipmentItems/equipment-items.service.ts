import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';
import { EquipmentItem, EquipmentItemDocument } from 'src/models/equipment-item.model';

@Injectable()
export class EquipmentItemsService {
    constructor(@InjectModel(EquipmentItem.name) private equipmentItemModel: Model<EquipmentItemDocument>) { }

    async findAll(): Promise<EquipmentItem[]> {
        return await this.equipmentItemModel.find().populate("addedSpell").exec();
    }

    async findAllAssetsQuantity(): Promise<AssetQuantity[]> {
        let equipments = await this.equipmentItemModel.find().populate("addedSpell").exec();

        const assetsQuantity: AssetQuantity[] = equipments.map((equip) => ({
            itemType: 'EquipmentItem',
            item: equip,
            quantity: 0,
        }));

        return assetsQuantity
    }

    async findOne(id: string): Promise<EquipmentItem> {
        const equipmentItem = await this.equipmentItemModel.findById(id).populate("addedSpell").exec();
        if (!equipmentItem) throw new NotFoundException(`EquipmentItem with id ${id} not found`);
        return equipmentItem;
    }

    async findByIds(ids: string[]): Promise<EquipmentItem[]> {
        const equipmentItems = await this.equipmentItemModel.find({ _id: { $in: ids } }).populate("addedSpell").exec();
        return equipmentItems;
    }
}
