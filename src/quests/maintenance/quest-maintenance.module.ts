import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { GroupPrizeReportService } from './group-prize-report.service';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';
import { QuestMaintenanceBoot } from './quest-maintenance.boot';

// importato SOLO da AppModule: gli harness non migrano (D-28)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
        ]),
    ],
    providers: [
        QuestEnemiesMigrator,
        GroupPrizeReportService,
        QuestMaintenanceBoot,
    ],
})
export class QuestMaintenanceModule {}
