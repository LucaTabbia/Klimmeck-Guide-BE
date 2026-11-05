import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
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
import { GeneratedQuestsResetMigrator } from './generated-quests-reset.migrator';
import { HuntPreyMigrator } from './hunt-prey.migrator';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

// importato SOLO da AppModule: gli harness non migrano (D-28)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: Lore.name, schema: LoreSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: City.name, schema: CitySchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
        QuestGenerationTriggerModule,
    ],
    providers: [
        QuestEnemiesMigrator,
        GeneratedQuestsResetMigrator,
        HuntPreyMigrator,
        QuestMaintenanceBoot,
    ],
})
export class QuestMaintenanceModule {}
