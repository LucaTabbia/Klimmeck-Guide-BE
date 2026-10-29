import { Resolver, Query, Args } from '@nestjs/graphql';
import { EquipmentItemsService } from './equipment-items.service';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';
import { ObjectIdListPipe, ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => EquipmentItem)
export class EquipmentItemsResolver {
    constructor(private equipmentItemsService: EquipmentItemsService) {}

    @Query(() => [EquipmentItem])
    async equipmentItems(): Promise<EquipmentItem[]> {
        return await this.equipmentItemsService.findAll();
    }

    @Query(() => [AssetQuantity])
    async equipmentAssetsQuantity(
        @Args('sellable', { type: () => Boolean, nullable: true })
        sellable?: boolean,
    ): Promise<AssetQuantity[]> {
        return await this.equipmentItemsService.findAllAssetsQuantity(sellable);
    }

    @Query(() => [EquipmentItem])
    async equipmentItemsByIds(
        @Args('ids', { type: () => [String] }, ObjectIdListPipe) ids: string[],
    ): Promise<EquipmentItem[]> {
        return await this.equipmentItemsService.findByIds(ids);
    }

    @Query(() => EquipmentItem)
    async equipmentItem(
        @Args('id', ObjectIdPipe) id: string,
    ): Promise<EquipmentItem> {
        return await this.equipmentItemsService.findOne(id);
    }
}
