// UNA TANTUM (Phase 12 D-25): ri-estrae le prede delle hunt al primo boot reale dal branch 13.1 e poi esce dal repo con la sua int-spec e hunt-prey.ts (13.1 D-07)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City, CityDocument } from 'src/models/city.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Lore, LoreDocument } from 'src/models/lore.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { refIdOf } from 'src/mongo/document-id';
import { stringsOf } from 'src/mongo/lean-values';
import { readEnemyCandidates } from 'src/quests/generation/enemy-candidate';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import { keyedChance } from 'src/quests/generation/seeded-chance';
import {
    StoredQuestEnemies,
    validQuestEnemiesOf,
} from 'src/quests/outcomes/quest-enemies';
import {
    HUNT_PREY_SEED,
    HuntCity,
    huntPreyPoolOf,
    huntRewriteOf,
    isCoherentHunt,
} from './hunt-prey';

export interface HuntPreyReport {
    redrawn: number;
    coherent: number;
    withoutPrey: number;
    inLane: number;
}

type HuntOutcome = keyof HuntPreyReport;

interface LeanHunt {
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
    relatedLore?: unknown;
}

interface HuntWorld {
    enemies: readonly EnemyCandidate[];
    poiTypes: ReadonlyMap<string, string[]>;
    poiCities: ReadonlyMap<string, HuntCity>;
    inLane: ReadonlySet<string>;
}

const OPEN_HUNT = { 'infos.type': QuestType.hunt, concludedAt: null } as const;

const markerOf = (hunt: LeanHunt): Types.ObjectId | null =>
    refIdOf(hunt.infos?.markerLocation);

// nessun hook di boot proprio: lo chiama QuestMaintenanceBoot dopo il reset delle generate
@Injectable()
export class HuntPreyMigrator {
    private readonly logger = new Logger(HuntPreyMigrator.name);

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
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
    ) {}

    async migrate(): Promise<HuntPreyReport> {
        const report: HuntPreyReport = {
            redrawn: 0,
            coherent: 0,
            withoutPrey: 0,
            inLane: 0,
        };
        const hunts = await this.openHunts();
        if (hunts.length === 0) return report;
        const world = await this.readWorld(hunts);
        for (const hunt of hunts) {
            report[await this.redraw(hunt, world)] += 1;
        }
        if (report.redrawn + report.withoutPrey + report.inLane > 0)
            this.logger.log(
                `Hunt: ${report.redrawn} rifatte, ${report.coherent} già coerenti, ${report.withoutPrey} senza prede, ${report.inLane} in corsia`,
            );
        return report;
    }

    private async redraw(
        hunt: LeanHunt,
        world: HuntWorld,
    ): Promise<HuntOutcome> {
        const id = hunt._id.toHexString();
        if (world.inLane.has(id)) {
            this.logger.warn(`Hunt ${id} in corsia: lasciata`);
            return 'inLane';
        }
        const poi = markerOf(hunt)?.toHexString() ?? '';
        const city = world.poiCities.get(poi);
        const pool = huntPreyPoolOf(
            world.enemies,
            world.poiTypes.get(poi) ?? [],
        );
        const rewrite = city
            ? huntRewriteOf({
                  pool,
                  city,
                  chance: keyedChance(HUNT_PREY_SEED, id),
              })
            : null;
        if (!rewrite) {
            this.logger.warn(`Hunt ${id} senza prede in zona: lasciata`);
            return 'withoutPrey';
        }
        const prey = validQuestEnemiesOf(hunt.infos)[0]?.enemy.toHexString();
        if (isCoherentHunt(prey ?? null, pool, hunt.requirements?.minTitle))
            return 'coherent';
        const update = await this.questModel
            .updateOne(
                { _id: hunt._id, ...OPEN_HUNT },
                {
                    $set: {
                        'infos.enemies': [
                            {
                                enemy: new Types.ObjectId(rewrite.prey.id),
                                quantity: 1,
                            },
                        ],
                        'requirements.minTitle': rewrite.minTitle,
                        'infos.title': rewrite.title,
                        'infos.description': rewrite.description,
                        'infos.relatedLore': rewrite.relatedLore.map(
                            (lore) => new Types.ObjectId(lore),
                        ),
                    },
                },
            )
            .exec();
        return update.modifiedCount > 0 ? 'redrawn' : 'coherent';
    }

    private async openHunts(): Promise<LeanHunt[]> {
        return this.questModel
            .find(OPEN_HUNT)
            .select(
                '_id infos.enemies infos.enemy infos.markerLocation requirements.minTitle',
            )
            .sort({ _id: 1 })
            .lean<LeanHunt[]>()
            .exec();
    }

    private async readWorld(hunts: readonly LeanHunt[]): Promise<HuntWorld> {
        const poiIds = hunts.flatMap((hunt) => {
            const marker = markerOf(hunt);
            return marker ? [marker] : [];
        });
        return {
            enemies: await readEnemyCandidates(this.enemyModel, this.loreModel),
            poiTypes: await this.readPoiTypes(poiIds),
            poiCities: await this.readPoiCities(poiIds),
            inLane: await this.readLaneQuestIds(),
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

    // la prima città per id che elenca il POI: nome e lore della voce del cacciatore
    private async readPoiCities(
        poiIds: readonly Types.ObjectId[],
    ): Promise<Map<string, HuntCity>> {
        const cities = await this.cityModel
            .find({ pointsOfInterest: { $in: poiIds } })
            .select('_id name pointsOfInterest relatedLore')
            .sort({ _id: 1 })
            .lean<LeanCity[]>()
            .exec();
        const poiCities = new Map<string, HuntCity>();
        for (const city of cities) {
            const huntCity: HuntCity = {
                name: city.name ?? '',
                relatedLore: refIdOf(city.relatedLore)?.toHexString() ?? null,
            };
            for (const poi of city.pointsOfInterest ?? []) {
                const hex = refIdOf(poi)?.toHexString();
                if (hex && !poiCities.has(hex)) poiCities.set(hex, huntCity);
            }
        }
        return poiCities;
    }

    // stessa protezione del reset delle generate: una hunt in corsia non cambia sotto i piedi di chi l'ha presa (13.1 D-07)
    private async readLaneQuestIds(): Promise<Set<string>> {
        const quests: unknown[] = await this.pendingQuestModel
            .distinct('quest')
            .exec();
        return new Set(
            quests.flatMap((quest) => {
                const id = refIdOf(quest);
                return id ? [id.toHexString()] : [];
            }),
        );
    }
}
