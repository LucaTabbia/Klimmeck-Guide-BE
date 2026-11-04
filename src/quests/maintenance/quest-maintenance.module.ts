import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestGenerationTriggerModule } from 'src/quests/generation/quest-generation-trigger.module';
import { DungeonStagesMigrator } from './dungeon-stages.migrator';
import { EnemyLegendaryMigrator } from './enemy-legendary.migrator';
import { JewelAccessoryMigrator } from './jewel-accessory.migrator';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

// importato SOLO da AppModule: gli harness non migrano (D-28)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
        ]),
        QuestGenerationTriggerModule,
    ],
    providers: [
        QuestEnemiesMigrator,
        EnemyLegendaryMigrator,
        JewelAccessoryMigrator,
        DungeonStagesMigrator,
        QuestMaintenanceBoot,
    ],
})
export class QuestMaintenanceModule {}
