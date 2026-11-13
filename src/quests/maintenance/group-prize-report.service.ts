import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { GROUP_PRIZE_TYPES } from '../prizes/rank-prizes';
import {
    describeGroupPrizeViolations,
    GROUP_PRIZE_REPORT_WARNINGS_LIMIT,
    GroupPrizeQuest,
    groupPrizeViolationsOf,
} from './group-prize.report';

export interface GroupPrizeReport {
    checked: number;
    invalid: number;
}

// sola lettura (D-24, D-28): la mano vince, il boot rende visibili le quest di gruppo da correggere senza toccarle
@Injectable()
export class GroupPrizeReportService {
    private readonly logger = new Logger(GroupPrizeReportService.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
    ) {}

    async report(): Promise<GroupPrizeReport> {
        const quests = await this.readOpenGroupQuests();
        let invalid = 0;
        for (const quest of quests) {
            const violations = groupPrizeViolationsOf(quest);
            if (violations.length === 0) continue;
            invalid += 1;
            if (invalid <= GROUP_PRIZE_REPORT_WARNINGS_LIMIT)
                this.logger.warn(
                    describeGroupPrizeViolations(quest._id, violations),
                );
        }
        if (invalid > 0)
            this.logger.warn(
                `Premi per titolo: ${invalid} quest di gruppo da correggere su ${quests.length}`,
            );
        return { checked: quests.length, invalid };
    }

    private readOpenGroupQuests(): Promise<GroupPrizeQuest[]> {
        return this.questModel
            .find(
                {
                    concludedAt: null,
                    'infos.type': { $in: [...GROUP_PRIZE_TYPES] },
                },
                { infos: 1, requirements: 1, prizes: 1 },
            )
            .lean<GroupPrizeQuest[]>()
            .exec();
    }
}
