// una imboscata alla volta (D-02): fuori dal callback POI, pool, composizione, catalogo, proprietario e risorteggio (Pitfall 10); dentro snapshot, combattimento e scritture; dopo il commit job e recuperi; solo chi ha scritto accoda
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Lore, LoreDocument } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { User, UserDocument } from 'src/models/user.model';
import { sameId } from 'src/mongo/document-id';
import { ownersOf } from 'src/mongo/owners-of';
import { readEnemyCandidates } from 'src/quests/generation/enemy-candidate';
import type { ComposedEnemy } from 'src/quests/generation/quest-composition';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { buildCombatContext } from 'src/quests/outcomes/combat/combat-context';
import type { CombatCharacterSnapshot } from 'src/quests/outcomes/combat/combat-context';
import { CombatResolver } from 'src/quests/outcomes/combat/combat-resolver';
import { battleOf, enemyFactsOf } from 'src/quests/outcomes/combatant-plan';
import { OUTCOME_CHARACTER_PROJECTION } from 'src/quests/outcomes/outcome-plan';
import {
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from 'src/quests/outcomes/outcome-writer.service';
import { statusFactsOf } from 'src/quests/outcomes/progression/status-facts';
import {
    type CombatCatalog,
    ResolutionLoader,
} from 'src/quests/outcomes/resolution-loader.service';
import { WalletService } from 'src/economy/wallet.service';
import { gameDistanceKm } from 'src/roads/game-distance';
import type { LonLat } from 'src/roads/road-route';
import { TravelScheduler } from '../travel-scheduler.service';
import type { DrawnAmbush } from './ambush-draw';
import { type AmbushIdentity, ambushJobId } from './ambush-job';
import {
    type AmbushCharacterSnapshot,
    type AmbushCity,
    type AmbushOutcomePlan,
    type AmbushTravelSnapshot,
    planAmbushOutcome,
} from './ambush-plan';
import { AmbushPlanner } from './ambush-planner.service';
import { nearestPoi, pointAtFraction } from './ambush-point';
import { composeAmbushEnemies } from './ambush-enemies';
import { ambushFilter, ambushSkipUpdate } from './ambush.updates';

export type AmbushOutcome = 'won' | 'lost' | 'skipped' | 'stale';

type AmbushCharacter = AmbushCharacterSnapshot & CombatCharacterSnapshot;

interface LeanPoi {
    _id: Types.ObjectId;
    type?: string[];
    location: LonLat;
    city?: unknown;
}

interface LeanCity {
    _id: Types.ObjectId;
    name: string;
    markerLocation?: unknown;
    pointsOfInterest?: unknown[];
}

interface AmbushPlace {
    poiTypes: readonly string[];
    nearCity: AmbushCity | null;
}

interface Fight {
    identity: AmbushIdentity;
    jobId: string;
    snapshot: AmbushCharacter;
    catalog: CombatCatalog;
    nearCity: AmbushCity;
    next: DrawnAmbush | null;
    userId: Types.ObjectId;
    now: Date;
}

const cityOf = (city: LeanCity): AmbushCity => ({
    id: city._id,
    name: city.name,
});

// città del POI, poi la città che lo elenca (A2), poi la città col marker più vicino al punto
function nearCityOf(
    poi: LeanPoi | null,
    cities: readonly LeanCity[],
    pois: readonly LeanPoi[],
    point: LonLat,
): AmbushCity | null {
    const owner =
        poi &&
        (cities.find((city) => sameId(poi.city, city._id)) ??
            cities.find(
                (city) =>
                    sameId(city.markerLocation, poi._id) ||
                    (city.pointsOfInterest ?? []).some((id) =>
                        sameId(id, poi._id),
                    ),
            ));
    if (owner) return cityOf(owner);
    let nearest: LeanCity | null = null;
    let nearestKm = Infinity;
    for (const city of cities) {
        const marker = pois.find((entry) =>
            sameId(city.markerLocation, entry._id),
        );
        if (!marker) continue;
        const km = gameDistanceKm(point, marker.location);
        if (km < nearestKm) {
            nearest = city;
            nearestKm = km;
        }
    }
    return nearest ? cityOf(nearest) : null;
}

const enemyEntriesOf = (composed: readonly ComposedEnemy[]) =>
    composed.map(({ enemy, quantity }) => ({
        enemy: new Types.ObjectId(enemy.id),
        quantity,
    }));

@Injectable()
export class AmbushResolutionService {
    private readonly logger = new Logger(AmbushResolutionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(Lore.name)
        private readonly loreModel: Model<LoreDocument>,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
        private readonly loader: ResolutionLoader,
        private readonly combat: CombatResolver,
        private readonly chance: ChanceSource,
        private readonly wallet: WalletService,
        private readonly writer: OutcomeWriter,
        private readonly planner: AmbushPlanner,
        private readonly scheduler: TravelScheduler,
        private readonly clock: Clock,
    ) {}

    async resolve(identity: AmbushIdentity): Promise<AmbushOutcome> {
        const now = this.clock.now();
        const jobId = ambushJobId(
            identity.characterId,
            identity.startTime,
            identity.at,
        );
        const snapshot = await this.characterModel
            .findOne(ambushFilter(identity, now), OUTCOME_CHARACTER_PROJECTION)
            .lean<AmbushCharacter | null>()
            .exec();
        if (!snapshot) return this.stale(jobId);
        const travel = snapshot.status.activeTravel;
        const { km } = travel.ambush;
        const place = await this.placeOf(travel, km);
        // ordine dei tiri fisso: composizione, poi risorteggio; il proprietario non tira
        const composed = composeAmbushEnemies({
            level: statusFactsOf(snapshot).level,
            poiTypes: place.poiTypes,
            enemies: await readEnemyCandidates(this.enemyModel, this.loreModel),
            chance: this.chance,
        });
        const next = this.planner.drawFrom(travel, km);
        const userId = (
            await ownersOf(this.userModel, [identity.characterId])
        ).get(identity.characterId.toHexString());
        if (!userId) {
            this.logger.warn(
                `Imboscata ${jobId}: personaggio senza proprietario, imboscata annullata`,
            );
            return this.skip(identity, travel, null, now, jobId);
        }
        if (!composed || !place.nearCity) {
            return this.skip(identity, travel, next, now, jobId);
        }
        const catalog = await this.loader.readCombatCatalog(
            enemyEntriesOf(composed),
            [snapshot],
            `dell'imboscata ${jobId}`,
        );
        if (catalog.enemies.length === 0) {
            return this.skip(identity, travel, next, now, jobId);
        }
        return this.fight({
            identity,
            jobId,
            snapshot,
            catalog,
            nearCity: place.nearCity,
            next,
            userId,
            now,
        });
    }

    private async placeOf(
        travel: AmbushTravelSnapshot,
        km: number,
    ): Promise<AmbushPlace> {
        const { point } = pointAtFraction(
            travel.road.coordinates,
            km / travel.road.distance,
        );
        const pois = await this.poiModel
            .find({}, { _id: 1, type: 1, location: 1, city: 1 })
            .lean<LeanPoi[]>()
            .exec();
        const cities = await this.cityModel
            .find(
                {},
                { _id: 1, name: 1, markerLocation: 1, pointsOfInterest: 1 },
            )
            .lean<LeanCity[]>()
            .exec();
        const nearest = nearestPoi(
            point,
            pois.map((poi) => ({ ...poi, id: poi._id.toHexString() })),
        );
        return {
            poiTypes: nearest?.type ?? [],
            nearCity: nearCityOf(nearest, cities, pois, point),
        };
    }

    // pool non componibile (D-08) o personaggio senza proprietario: nessun effetto, solo la prossima imboscata
    private async skip(
        identity: AmbushIdentity,
        travel: AmbushTravelSnapshot,
        next: DrawnAmbush | null,
        now: Date,
        jobId: string,
    ): Promise<AmbushOutcome> {
        const written = await this.characterModel
            .findOneAndUpdate(
                ambushFilter(identity, now),
                ambushSkipUpdate(next),
                {
                    projection: { _id: 1 },
                },
            )
            .exec();
        if (!written) return this.stale(jobId);
        await this.afterCommit(
            identity.characterId,
            {
                startTime: travel.startTime,
                endTime: travel.endTime,
                ambush: next,
            },
            now,
        );
        this.logger.log(`Imboscata ${jobId} risolta: skipped`);
        return 'skipped';
    }

    private async fight(fight: Fight): Promise<AmbushOutcome> {
        const { identity, jobId, catalog, now } = fight;
        const resultId = new Types.ObjectId();
        const outcome: { plan: AmbushOutcomePlan | null } = { plan: null };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                outcome.plan = null;
                const inSession = await this.characterModel
                    .findOne(
                        ambushFilter(identity, now),
                        OUTCOME_CHARACTER_PROJECTION,
                    )
                    .session(session)
                    .lean<AmbushCharacter | null>()
                    .exec();
                if (!inSession) throw new StaleResolution();
                const context = buildCombatContext({
                    quest: {
                        _id: resultId,
                        infos: {
                            type: QuestType.enemy,
                            title: `Imboscata presso ${fight.nearCity.name}`,
                        },
                    },
                    enemies: catalog.enemies,
                    participants: [inSession],
                    equipment: catalog.equipment,
                    spells: catalog.spells,
                    loot: catalog.loot,
                });
                const battle = battleOf(
                    this.combat.resolve(context, this.chance),
                    identity.characterId,
                );
                if (battle?.verdict !== 'success') {
                    throw new Error('ambush defeat not wired');
                }
                const plan = planAmbushOutcome({
                    snapshot: inSession,
                    identity,
                    resultId,
                    userId: fight.userId,
                    verdict: battle.verdict,
                    effects: battle.effects,
                    enemies: enemyFactsOf(catalog) ?? { entries: [], xp: 0 },
                    nearCity: fight.nearCity,
                    nextAmbush: fight.next,
                    detour: null,
                    spellRecoveryTimes: catalog.recoveryTimes,
                    spellMaxUsages: catalog.spellMaxUsages,
                    now,
                });
                await this.writer.writeCharacterUpdate(
                    plan.filter,
                    plan.update,
                    session,
                );
                if (plan.coinsDelta > 0) {
                    await this.wallet.applyCharacterCoinsDelta(
                        identity.characterId,
                        plan.coinsDelta,
                        session,
                    );
                }
                outcome.plan = plan;
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            return this.stale(jobId);
        }
        if (!outcome.plan) return this.stale(jobId);
        await this.writer.deliver({
            ...emptyCommitted(),
            spellRecoveries: outcome.plan.spellRecoveries,
        });
        await this.afterCommit(
            identity.characterId,
            outcome.plan.travelAfter,
            now,
        );
        this.logger.log(`Imboscata ${jobId} risolta: won`);
        return 'won';
    }

    // la prossima imboscata, oppure il completamento già scaduto che il filtro aveva fatto aspettare (Pitfall 1)
    private async afterCommit(
        characterId: Types.ObjectId,
        travel: AmbushOutcomePlan['travelAfter'],
        now: Date,
    ): Promise<void> {
        if (travel.ambush) {
            await this.scheduler.scheduleAmbush(
                characterId,
                travel.startTime,
                travel.ambush.at,
            );
            return;
        }
        if (travel.endTime.getTime() <= now.getTime()) {
            await this.scheduler.schedule(characterId, travel);
        }
    }

    private stale(jobId: string): AmbushOutcome {
        this.logger.log(
            `Imboscata ${jobId} non più valida o non ancora scaduta: nessuna scrittura`,
        );
        return 'stale';
    }
}
