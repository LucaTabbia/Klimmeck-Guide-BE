import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EquipmentItemsResolver } from './equipment-items.resolver';
import { EquipmentItemsService } from './equipment-items.service';
import { EquipmentItem, EquipmentItemSchema } from 'src/models/equipment-item.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
        ]),
    ],
    providers: [EquipmentItemsService, EquipmentItemsResolver],
    exports: [EquipmentItemsService],
})
export class EquipmentItemsModule { }
