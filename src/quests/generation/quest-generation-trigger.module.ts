import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    QUEST_GENERATION_CONFIG,
    questGenerationConfigProvider,
} from 'src/config/quest-generation-config';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import { QuestGenerator } from 'src/quests/generation/quest-generator.service';
import {
    ChanceSource,
    MathChanceSource,
} from 'src/quests/outcomes/chance-source';

// nessuno sweeper né corsa al boot qui (D-30): gli harness degli esiti lo importano senza effetti
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: City.name, schema: CitySchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: Lore.name, schema: LoreSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Pet.name, schema: PetSchema },
        ]),
    ],
    providers: [
        questGenerationConfigProvider,
        { provide: ChanceSource, useClass: MathChanceSource },
        QuestGenerator,
        { provide: QuestGenerationTrigger, useExisting: QuestGenerator },
    ],
    exports: [QuestGenerator, QuestGenerationTrigger, QUEST_GENERATION_CONFIG],
})
export class QuestGenerationTriggerModule {}
