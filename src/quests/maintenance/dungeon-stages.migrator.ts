// UNA TANTUM (Phase 12 D-25): arricchisce a tappe le dungeon fisse al primo boot reale e poi esce dal repo con la sua int-spec e dungeon-stages.ts; da lì cura a DB (D-13)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GeneratedRank,
    isGeneratedRank,
} from 'src/quests/generation/generation-rules';
import { keyedChance } from 'src/quests/generation/seeded-chance';
import {
    StoredQuestEnemies,
    validQuestEnemiesOf,
} from 'src/quests/outcomes/quest-enemies';
import { DUNGEON_STAGES_SEED, dungeonStagesOf } from './dungeon-stages';

export interface DungeonStagesReport {
    enriched: number;
    skipped: number;
}

interface LeanDungeon {
    _id: Types.ObjectId;
    infos?:
        | (StoredQuestEnemies & { markerLocation?: Types.ObjectId | null })
        | null;
    requirements?: { minTitle?: unknown } | null;
}

interface LeanEnemy {
    _id: Types.ObjectId;
    name?: string | null;
    xp?: unknown;
    locations?: unknown;
    legendary?: unknown;
}

interface LeanPoi {
    _id: Types.ObjectId;
    type?: unknown;
}

// al più un nemico: una dungeon curata a mano con più voci non si tocca (T-13-18)
const MAX_CURRENT_ENEMIES = 1;
// una dungeon arricchita esce con almeno due tappe: con una sola resterebbe ammessa e la corsa dopo la allungherebbe ancora
const MIN_ENRICHED_STAGES = 2;

const stringsOf = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
};

const candidateOf = (enemy: LeanEnemy): EnemyCandidate => ({
    id: enemy._id.toHexString(),
    name: enemy.name ?? '',
    xp: typeof enemy.xp === 'number' ? enemy.xp : 0,
    locations: stringsOf(enemy.locations),
    legendary: enemy.legendary,
    relatedLore: [],
    baseWeaknesses: [],
    energyWeaknesses: [],
});

// legend non ha tappe proprie: le sue dungeon restano alla cura a DB
const isStagedRank = (title: unknown): title is GeneratedRank =>
    isGeneratedRank(title) && title !== TitleType.legend;

// nessun hook di boot proprio: lo chiama QuestMaintenanceBoot dopo i gioielli, a leggendari già marcati
@Injectable()
export class DungeonStagesMigrator {
    private readonly logger = new Logger(DungeonStagesMigrator.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
    ) {}

    async migrate(): Promise<DungeonStagesReport> {
        const dungeons = (await this.openDungeons()).filter(
            (dungeon) =>
                validQuestEnemiesOf(dungeon.infos).length <=
                MAX_CURRENT_ENEMIES,
        );
        const report: DungeonStagesReport = { enriched: 0, skipped: 0 };
        if (dungeons.length === 0) return report;
        const enemies = await this.readEnemies();
        const poiTypes = await this.readPoiTypes(dungeons);
        for (const dungeon of dungeons) {
            const enriched = await this.enrich(dungeon, enemies, poiTypes);
            if (enriched) report.enriched += 1;
            else report.skipped += 1;
        }
        if (report.enriched > 0)
            this.logger.log(`Dungeon: ${report.enriched} arricchite a tappe`);
        return report;
    }

    private async enrich(
        dungeon: LeanDungeon,
        enemies: readonly EnemyCandidate[],
        poiTypes: ReadonlyMap<string, string[]>,
    ): Promise<boolean> {
        const id = dungeon._id.toHexString();
        const rank = dungeon.requirements?.minTitle;
        if (!isStagedRank(rank)) {
            this.logger.warn(
                `Dungeon ${id} con minTitle non generabile: saltata`,
            );
            return false;
        }
        const current = validQuestEnemiesOf(dungeon.infos).map((entry) => ({
            enemy: entry.enemy.toHexString(),
            quantity: entry.quantity,
        }));
        const stages = dungeonStagesOf({
            rank,
            current,
            poiTypes:
                poiTypes.get(
                    dungeon.infos?.markerLocation?.toHexString() ?? '',
                ) ?? [],
            enemies,
            chance: keyedChance(DUNGEON_STAGES_SEED, id),
        });
        if (
            stages.length < MIN_ENRICHED_STAGES ||
            stages.length <= current.length
        )
            return false;
        const update = await this.questModel
            .updateOne(
                {
                    _id: dungeon._id,
                    concludedAt: null,
                    'infos.enemies.1': { $exists: false },
                },
                {
                    $set: {
                        'infos.enemies': stages.map((stage) => ({
                            enemy: new Types.ObjectId(stage.enemy),
                            quantity: stage.quantity,
                        })),
                    },
                },
            )
            .exec();
        return update.modifiedCount > 0;
    }

    private async openDungeons(): Promise<LeanDungeon[]> {
        return this.questModel
            .find({ 'infos.type': QuestType.dungeon, concludedAt: null })
            .select(
                '_id infos.enemies infos.enemy infos.markerLocation requirements.minTitle',
            )
            .sort({ _id: 1 })
            .lean<LeanDungeon[]>()
            .exec();
    }

    // solo i non leggendari marcati (D-04): il passo dei leggendari gira prima
    private async readEnemies(): Promise<EnemyCandidate[]> {
        const enemies = await this.enemyModel
            .find({ legendary: false })
            .select('_id name xp locations legendary')
            .sort({ _id: 1 })
            .lean<LeanEnemy[]>()
            .exec();
        return enemies.map(candidateOf);
    }

    private async readPoiTypes(
        dungeons: readonly LeanDungeon[],
    ): Promise<Map<string, string[]>> {
        const ids = dungeons.flatMap((dungeon) =>
            dungeon.infos?.markerLocation ? [dungeon.infos.markerLocation] : [],
        );
        const pois = await this.poiModel
            .find({ _id: { $in: ids } })
            .select('_id type')
            .lean<LeanPoi[]>()
            .exec();
        return new Map(
            pois.map((poi) => [poi._id.toHexString(), stringsOf(poi.type)]),
        );
    }
}
