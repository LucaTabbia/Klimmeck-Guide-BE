import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EquipmentItem, EquipmentItemDocument } from 'src/models/equipment-item.model';

@Injectable()
export class EquipmentItemsService {
    constructor(@InjectModel(EquipmentItem.name) private equipmentItemModel: Model<EquipmentItemDocument>) { }

    async findAll(): Promise<EquipmentItem[]> {
        return await this.equipmentItemModel.find().exec();
    }

    async findOne(id: string): Promise<EquipmentItem> {
        const equipmentItem = await this.equipmentItemModel.findById(id).exec();
        if (!equipmentItem) throw new NotFoundException(`EquipmentItem with id ${id} not found`);
        return equipmentItem;
    }
}
