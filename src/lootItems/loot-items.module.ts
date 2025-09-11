import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LootItemsResolver } from './loot-items.resolver';
import { LootItemsService } from './loot-items.service';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: LootItem.name, schema: LootItemSchema },
        ]),
    ],
    providers: [LootItemsService, LootItemsResolver],
    exports: [LootItemsService],
})
export class LootItemsModule { }
