import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateWithAggregationPipeline } from 'mongoose';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import {
    enemiesPipeline,
    UNMIGRATED_QUEST_FILTER,
    UNMIGRATED_RESULT_FILTER,
} from './quest-enemies.migration';

export interface QuestEnemiesMigrationReport {
    quests: number;
    results: number;
}

// la pipeline è un documento Mongo puro: Mongoose la passa al driver senza cast
const asUpdatePipeline = (stages: Record<string, unknown>[]) =>
    stages as unknown as UpdateWithAggregationPipeline;

// permanente (D-28): resta nel repo finché esiste il lettore tollerante; lo chiama QuestMaintenanceBoot
@Injectable()
export class QuestEnemiesMigrator {
    private readonly logger = new Logger(QuestEnemiesMigrator.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
    ) {}

    async migrateAll(): Promise<QuestEnemiesMigrationReport> {
        const quests = await this.questModel
            .updateMany(
                UNMIGRATED_QUEST_FILTER,
                asUpdatePipeline(
                    enemiesPipeline('infos.enemies', 'infos.enemy'),
                ),
            )
            .exec();
        const results = await this.questResultModel
            .updateMany(
                UNMIGRATED_RESULT_FILTER,
                asUpdatePipeline(enemiesPipeline('enemies', 'enemy')),
            )
            .exec();
        const report = {
            quests: quests.modifiedCount,
            results: results.modifiedCount,
        };
        if (report.quests > 0 || report.results > 0)
            this.logger.log(
                `Nemici delle missioni: ${report.quests} missioni e ${report.results} risultati migrati alla lista`,
            );
        return report;
    }
}
