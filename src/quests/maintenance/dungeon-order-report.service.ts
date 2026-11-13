import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import {
    type StoredQuestEnemies,
    validQuestEnemiesOf,
} from '../outcomes/quest-enemies';
import {
    describeDungeonOrder,
    DUNGEON_ORDER_REPORT_WARNINGS_LIMIT,
    strongestEnemyIsLast,
} from './dungeon-order.report';

export interface DungeonOrderReport {
    checked: number;
    outOfOrder: number;
}

interface DungeonGroups {
    _id: Types.ObjectId;
    groups: Types.ObjectId[];
}

interface StoredDungeon {
    _id: Types.ObjectId;
    infos?: StoredQuestEnemies | null;
}

// sola lettura (quick 261113-aql): il BE combatte i gruppi nell'ordine scritto, il boot rende visibili le dungeon da riordinare a mano
@Injectable()
export class DungeonOrderReportService {
    private readonly logger = new Logger(DungeonOrderReportService.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
    ) {}

    async report(): Promise<DungeonOrderReport> {
        const dungeons = await this.readOpenDungeons();
        const xpById = await this.readEnemyXps(dungeons);
        let outOfOrder = 0;
        for (const { _id, groups } of dungeons) {
            if (strongestEnemyIsLast(groups, xpById)) continue;
            outOfOrder += 1;
            if (outOfOrder <= DUNGEON_ORDER_REPORT_WARNINGS_LIMIT)
                this.logger.warn(describeDungeonOrder(_id));
        }
        if (outOfOrder > 0)
            this.logger.warn(
                `Ordine della dungeon: ${outOfOrder} dungeon da riordinare su ${dungeons.length}`,
            );
        return { checked: dungeons.length, outOfOrder };
    }

    private async readOpenDungeons(): Promise<DungeonGroups[]> {
        const dungeons = await this.questModel
            .find(
                { concludedAt: null, 'infos.type': QuestType.dungeon },
                { 'infos.enemies': 1, 'infos.enemy': 1 },
            )
            .lean<StoredDungeon[]>()
            .exec();
        return dungeons.map(({ _id, infos }) => ({
            _id,
            groups: validQuestEnemiesOf(infos).map(({ enemy }) => enemy),
        }));
    }

    private async readEnemyXps(
        dungeons: readonly DungeonGroups[],
    ): Promise<Map<string, number | null>> {
        const ids = dungeons.flatMap(({ groups }) => groups);
        if (ids.length === 0) return new Map();
        const enemies = await this.enemyModel
            .find({ _id: { $in: ids } }, { xp: 1 })
            .lean<{ _id: Types.ObjectId; xp?: number | null }[]>()
            .exec();
        return new Map(
            enemies.map(({ _id, xp }) => [_id.toHexString(), xp ?? null]),
        );
    }
}
