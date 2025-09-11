import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { LootItemsService } from './loot-items.service';
import { LootItem } from 'src/models/loot-item.model';

@Resolver(() => LootItem)
export class LootItemsResolver {
    constructor(private lootItemsService: LootItemsService) { }

    @Query(() => [LootItem])
    async lootItems(): Promise<LootItem[]> {
        return this.lootItemsService.findAll();
    }

    @Query(() => LootItem)
    async lootItem(@Args('id') id: string): Promise<LootItem> {
        return this.lootItemsService.findOne(id);
    }
}
