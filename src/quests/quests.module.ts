import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { QuestsPublisher } from './quests.publisher';
import { QuestsResolver } from './quests.resolver';
import { QuestsService } from './quests.service';

// modulo autosufficiente: registra ogni modello che il populate del catalogo attraversa (C3)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: Lore.name, schema: LoreSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
    ],
    providers: [QuestsService, QuestsResolver, QuestsPublisher],
    exports: [QuestsService],
})
export class QuestsModule {}
