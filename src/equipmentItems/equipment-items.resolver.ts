import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { EquipmentItemsService } from './equipment-items.service';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';

@Resolver(() => EquipmentItem)
export class EquipmentItemsResolver {
    constructor(private equipmentItemsService: EquipmentItemsService) { }

    @Query(() => [EquipmentItem])
    async equipmentItems(): Promise<EquipmentItem[]> {
        return await this.equipmentItemsService.findAll();
    }

    @Query(() => [AssetQuantity])
    async equipmentAssetsQuantity(): Promise<AssetQuantity[]> {
        return await this.equipmentItemsService.findAllAssetsQuantity();
    }

    @Query(() => [EquipmentItem])
    async equipmentItemsByIds(@Args('ids', { type: () => [String] }) ids: string[]): Promise<EquipmentItem[]> {
        return await this.equipmentItemsService.findByIds(ids);
    }

    @Query(() => EquipmentItem)
    async equipmentItem(@Args('id') id: string): Promise<EquipmentItem> {
        return await this.equipmentItemsService.findOne(id);
    }
}
