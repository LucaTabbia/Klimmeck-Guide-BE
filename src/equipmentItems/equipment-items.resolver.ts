import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { EquipmentItemsService } from './equipment-items.service';
import { EquipmentItem } from 'src/models/equipment-item.model';

@Resolver(() => EquipmentItem)
export class EquipmentItemsResolver {
    constructor(private equipmentItemsService: EquipmentItemsService) { }

    @Query(() => [EquipmentItem])
    async equipmentItems(): Promise<EquipmentItem[]> {
        return this.equipmentItemsService.findAll();
    }

    @Query(() => EquipmentItem)
    async equipmentItem(@Args('id') id: string): Promise<EquipmentItem> {
        return this.equipmentItemsService.findOne(id);
    }
}
