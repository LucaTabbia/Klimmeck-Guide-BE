// UNA TANTUM (Phase 12 D-25): ricompone le tappe delle dungeon fisse al primo boot reale dal branch 13.1 e poi esce dal repo con la sua int-spec e dungeon-stages.ts (13.1 D-07)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City, CityDocument } from 'src/models/city.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Lore, LoreDocument } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { refIdOf } from 'src/mongo/document-id';
import {
    readEnemyCandidates,
    stringsOf,
} from 'src/quests/generation/enemy-candidate';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import { isGeneratedRank } from 'src/quests/generation/generation-rules';
import { keyedChance } from 'src/quests/generation/seeded-chance';
import {
    StoredQuestEnemies,
    validQuestEnemiesOf,
} from 'src/quests/outcomes/quest-enemies';
import {
    DUNGEON_STAGES_SEED,
    DungeonStage,
    dungeonStagesOf,
    dungeonTitleOf,
    isCoherentDungeon,
} from './dungeon-stages';

export interface DungeonStagesReport {
    recomposed: number;
    coherent: number;
    skipped: number;
}

type DungeonOutcome = keyof DungeonStagesReport;

interface LeanDungeon {
    _id: Types.ObjectId;
    infos?: (StoredQuestEnemies & { markerLocation?: unknown }) | null;
    requirements?: { minTitle?: unknown } | null;
}

interface LeanPoi {
    _id: Types.ObjectId;
    type?: unknown;
}

interface LeanCity {
    _id: Types.ObjectId;
    name?: string | null;
    pointsOfInterest?: unknown[] | null;
}

interface DungeonWorld {
    enemies: readonly EnemyCandidate[];
    byId: ReadonlyMap<string, EnemyCandidate>;
    poiTypes: ReadonlyMap<string, string[]>;
    poiCities: ReadonlyMap<string, string>;
}

// mai ricomporre una dungeon con un party già partito (filtro di lettura e di scrittura)
const OPEN_DUNGEON = {
    'infos.type': QuestType.dungeon,
    concludedAt: null,
    startedAt: null,
} as const;

const markerOf = (dungeon: LeanDungeon): Types.ObjectId | null =>
    refIdOf(dungeon.infos?.markerLocation);

// nessun hook di boot proprio: lo chiama QuestMaintenanceBoot dopo le prede delle hunt
@Injectable()
export class DungeonStagesMigrator {
    private readonly logger = new Logger(DungeonStagesMigrator.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(Lore.name)
        private readonly loreModel: Model<LoreDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
    ) {}

    async migrate(): Promise<DungeonStagesReport> {
        const report: DungeonStagesReport = {
            recomposed: 0,
            coherent: 0,
            skipped: 0,
        };
        const dungeons = await this.openDungeons();
        if (dungeons.length === 0) return report;
        const world = await this.readWorld(dungeons);
        for (const dungeon of dungeons) {
            report[await this.recompose(dungeon, world)] += 1;
        }
        if (report.recomposed > 0)
            this.logger.log(
                `Dungeon: ${report.recomposed} ricomposte, ${report.coherent} già coerenti`,
            );
        return report;
    }

    private async recompose(
        dungeon: LeanDungeon,
        world: DungeonWorld,
    ): Promise<DungeonOutcome> {
        const id = dungeon._id.toHexString();
        const rank = dungeon.requirements?.minTitle;
        if (!isGeneratedRank(rank)) {
            this.logger.warn(
                `Dungeon ${id} con minTitle non generabile: saltata`,
            );
            return 'skipped';
        }
        const current = validQuestEnemiesOf(dungeon.infos).map((entry) => ({
            enemy: entry.enemy.toHexString(),
            quantity: entry.quantity,
        }));
        if (isCoherentDungeon(current, world.byId, rank)) return 'coherent';
        const poi = markerOf(dungeon)?.toHexString() ?? '';
        const stages = dungeonStagesOf({
            rank,
            current,
            poiTypes: world.poiTypes.get(poi) ?? [],
            enemies: world.enemies,
            chance: keyedChance(DUNGEON_STAGES_SEED, id),
        });
        if (stages === null) {
            this.logger.warn(`Dungeon ${id} senza tappe componibili: lasciata`);
            return 'skipped';
        }
        const update = await this.questModel
            .updateOne(
                { _id: dungeon._id, ...OPEN_DUNGEON },
                {
                    $set: {
                        'infos.enemies': stages.map((stage) => ({
                            enemy: new Types.ObjectId(stage.enemy),
                            quantity: stage.quantity,
                        })),
                        ...this.retitleOf(stages, current, poi, world),
                    },
                },
            )
            .exec();
        return update.modifiedCount > 0 ? 'recomposed' : 'coherent';
    }

    // il titolo segue il primo nemico solo se cambia e la città del POI esiste; la voce del contenuto resta (13.1 D-07)
    private retitleOf(
        stages: readonly DungeonStage[],
        current: readonly DungeonStage[],
        poi: string,
        world: DungeonWorld,
    ): { 'infos.title'?: string } {
        const first = stages[0].enemy;
        const city = world.poiCities.get(poi);
        const enemy = world.byId.get(first);
        if (first === current[0]?.enemy || !city || !enemy) return {};
        return { 'infos.title': dungeonTitleOf(enemy.name, city) };
    }

    private async openDungeons(): Promise<LeanDungeon[]> {
        return this.questModel
            .find(OPEN_DUNGEON)
            .select(
                '_id infos.enemies infos.enemy infos.markerLocation requirements.minTitle',
            )
            .sort({ _id: 1 })
            .lean<LeanDungeon[]>()
            .exec();
    }

    private async readWorld(
        dungeons: readonly LeanDungeon[],
    ): Promise<DungeonWorld> {
        const poiIds = dungeons.flatMap((dungeon) => {
            const marker = markerOf(dungeon);
            return marker ? [marker] : [];
        });
        const enemies = await readEnemyCandidates(
            this.enemyModel,
            this.loreModel,
        );
        return {
            enemies,
            byId: new Map(enemies.map((enemy) => [enemy.id, enemy])),
            poiTypes: await this.readPoiTypes(poiIds),
            poiCities: await this.readPoiCities(poiIds),
        };
    }

    private async readPoiTypes(
        poiIds: readonly Types.ObjectId[],
    ): Promise<Map<string, string[]>> {
        const pois = await this.poiModel
            .find({ _id: { $in: poiIds } })
            .select('_id type')
            .lean<LeanPoi[]>()
            .exec();
        return new Map(
            pois.map((poi) => [poi._id.toHexString(), stringsOf(poi.type)]),
        );
    }

    // la prima città per id che elenca il POI dà il nome al titolo
    private async readPoiCities(
        poiIds: readonly Types.ObjectId[],
    ): Promise<Map<string, string>> {
        const cities = await this.cityModel
            .find({ pointsOfInterest: { $in: poiIds } })
            .select('_id name pointsOfInterest')
            .sort({ _id: 1 })
            .lean<LeanCity[]>()
            .exec();
        const poiCities = new Map<string, string>();
        for (const city of cities) {
            for (const poi of city.pointsOfInterest ?? []) {
                const hex = refIdOf(poi)?.toHexString();
                if (hex && city.name && !poiCities.has(hex))
                    poiCities.set(hex, city.name);
            }
        }
        return poiCities;
    }
}
