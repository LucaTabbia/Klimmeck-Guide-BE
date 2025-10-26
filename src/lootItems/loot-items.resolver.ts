import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { LootItemsService } from './loot-items.service';
import { LootItem } from 'src/models/loot-item.model';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';

@Resolver(() => LootItem)
export class LootItemsResolver {
    constructor(private lootItemsService: LootItemsService) { }

    @Query(() => [LootItem])
    async lootItems(): Promise<LootItem[]> {
        return await this.lootItemsService.findAll();
    }

    @Query(() => [AssetQuantity])
    async lootAssetsQuantity(): Promise<AssetQuantity[]> {
        return await this.lootItemsService.findAllAssetsQuantity();
    }

    @Query(() => LootItem)
    async lootItem(@Args('id') id: string): Promise<LootItem> {
        return await this.lootItemsService.findOne(id);
    }


    @Query(() => [LootItem])
    async lootItemsByIds(@Args('ids', { type: () => [String] }) ids: string[]): Promise<LootItem[]> {
        return await this.lootItemsService.findByIds(ids);
    }
}
