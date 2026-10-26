import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { QuestResultsService } from './quest-results.service';

// sola lettura, senza change stream: lo importano il resolver dei risultati e il completamento GM (09-15)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: Spell.name, schema: SpellSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
        ]),
    ],
    providers: [QuestResultsService],
    exports: [QuestResultsService],
})
export class QuestResultsReadModule {}
