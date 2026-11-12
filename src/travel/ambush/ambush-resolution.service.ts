// una imboscata alla volta (D-02): fuori dal callback POI, pool, composizione, catalogo, proprietario, risorteggio e rotta della deviazione (Pitfall 10); dentro snapshot, combattimento, scritture e abbandono della corsia; dopo il commit push, job e recuperi; solo chi ha scritto accoda
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { unstartedSeatReleaseOf } from 'src/characters/deletion/seat-release';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
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
import { User, UserDocument } from 'src/models/user.model';
import { sameId } from 'src/mongo/document-id';
import { ownersOf } from 'src/mongo/owners-of';
import { ambushDefeat } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
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
import { victoryKnowledgeOf } from 'src/quests/outcomes/victory-knowledge';
import {
    type CombatCatalog,
    ResolutionLoader,
} from 'src/quests/outcomes/resolution-loader.service';
import { WalletService } from 'src/economy/wallet.service';
import { gameDistanceKm } from 'src/roads/game-distance';
import type { LonLat, RouteTarget } from 'src/roads/road-route';
import { RoadsService } from 'src/roads/roads.service';
import {
    type FoodCatalogEntry,
    TravelPantryReader,
} from '../food/travel-pantry.reader';
import { TravelPlanner } from '../travel-planner.service';
import { TravelScheduler } from '../travel-scheduler.service';
import { detourFallbacksOf, residualDetourOf } from './ambush-detour';
import type { DrawnAmbush } from './ambush-draw';
import { ambushFoodOf, withFoodSettlement } from './ambush-food';
import { type AmbushIdentity, ambushJobId } from './ambush-job';
import {
    type AmbushCharacterSnapshot,
    type AmbushCity,
    type AmbushOutcomePlan,
    type AmbushTravelSnapshot,
    type DetourDraft,
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
    point: LonLat;
    segment: number;
    pois: LeanPoi[];
    cities: LeanCity[];
}

interface Fight {
    identity: AmbushIdentity;
    jobId: string;
    snapshot: AmbushCharacter;
    catalog: CombatCatalog;
    foodCatalog: FoodCatalogEntry[];
    nearCity: AmbushCity;
    next: DrawnAmbush | null;
    detour: DetourDraft;
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

// città più vicina per strada fra tutti i marker, meta e partenza comprese (D-11)
function markerTargetsOf(
    cities: readonly LeanCity[],
    pois: readonly LeanPoi[],
): RouteTarget[] {
    return cities.flatMap((city) => {
        const marker = pois.find((poi) => sameId(city.markerLocation, poi._id));
        return marker
            ? [{ id: marker._id.toHexString(), location: marker.location }]
            : [];
    });
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
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        private readonly loader: ResolutionLoader,
        private readonly combat: CombatResolver,
        private readonly chance: ChanceSource,
        private readonly wallet: WalletService,
        private readonly writer: OutcomeWriter,
        private readonly planner: AmbushPlanner,
        private readonly scheduler: TravelScheduler,
        private readonly roads: RoadsService,
        private readonly travelPlanner: TravelPlanner,
        private readonly push: PushService,
        private readonly clock: Clock,
        private readonly pantry: TravelPantryReader,
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
            return this.skip(
                identity,
                travel,
                null,
                now,
                jobId,
                'personaggio senza proprietario',
            );
        }
        if (!composed) {
            return this.skip(
                identity,
                travel,
                next,
                now,
                jobId,
                'pool non componibile',
            );
        }
        if (!place.nearCity) {
            return this.skip(
                identity,
                travel,
                next,
                now,
                jobId,
                'nessuna città vicina',
            );
        }
        const catalog = await this.loader.readCombatCatalog(
            enemyEntriesOf(composed),
            [snapshot],
            `dell'imboscata ${jobId}`,
        );
        if (catalog.enemies.length === 0) {
            return this.skip(
                identity,
                travel,
                next,
                now,
                jobId,
                'catalogo vuoto',
            );
        }
        return this.fight({
            identity,
            jobId,
            snapshot,
            catalog,
            foodCatalog: await this.pantry.foodCatalogFor(
                snapshot.assets?.ownedItems ?? [],
            ),
            nearCity: place.nearCity,
            next,
            detour: await this.detourOf(snapshot, place, place.nearCity, jobId),
            userId,
            now,
        });
    }

    // rotta dal punto (C7: poi dai vertici della polilinea); senza rotta la pedina prosegue verso la meta (D-25)
    private async detourOf(
        snapshot: AmbushCharacter,
        place: AmbushPlace,
        nearCity: AmbushCity,
        jobId: string,
    ): Promise<DetourDraft> {
        const travel = snapshot.status.activeTravel;
        const { point, segment, pois, cities } = place;
        const petSpeed = await this.travelPlanner.speedOfCharacter(
            snapshot.assets?.pet,
            [],
        );
        const nearest = this.roads.nearestByTime(
            point,
            markerTargetsOf(cities, pois),
            detourFallbacksOf(travel.road.coordinates, segment),
        );
        const marker = nearest ? new Types.ObjectId(nearest.id) : null;
        const reached =
            marker &&
            cities.find((city) => sameId(city.markerLocation, marker));
        if (nearest && marker && reached) {
            return {
                road: {
                    coordinates: nearest.route.coordinates,
                    distance: nearest.route.distanceKm,
                },
                to: marker,
                reachedCity: cityOf(reached),
                baseHours: nearest.route.baseHours,
                residualMs: null,
                petSpeed,
            };
        }
        this.logger.warn(
            `Imboscata ${jobId}: nessuna città raggiungibile per strada, si prosegue verso ${String(travel.to)}`,
        );
        const destination = pois.find((poi) => sameId(travel.to, poi._id));
        const last =
            travel.road.coordinates[travel.road.coordinates.length - 1];
        return residualDetourOf({
            travel,
            point,
            segment,
            reachedCity:
                nearCityOf(destination ?? null, cities, pois, last ?? point) ??
                nearCity,
            petSpeed,
        });
    }

    private async placeOf(
        travel: AmbushTravelSnapshot,
        km: number,
    ): Promise<AmbushPlace> {
        const { point, segment } = pointAtFraction(
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
            point,
            segment,
            pois,
            cities,
        };
    }

    // pool non componibile (D-08), nessuna città vicina, catalogo vuoto o personaggio senza proprietario: nessun effetto, solo la prossima imboscata
    private async skip(
        identity: AmbushIdentity,
        travel: AmbushTravelSnapshot,
        next: DrawnAmbush | null,
        now: Date,
        jobId: string,
        reason: string,
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
        this.logger.log(`Imboscata ${jobId} risolta: skipped (${reason})`);
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
                // vita vera del punto: fame e pasto al km salvato prima del combattimento (Phase 20 D-07, D-16)
                const food = ambushFoodOf({
                    snapshot: inSession,
                    catalog: fight.foodCatalog,
                    now,
                });
                const fighter = withFoodSettlement(
                    inSession,
                    food?.progress ?? null,
                );
                const context = buildCombatContext({
                    quest: {
                        _id: resultId,
                        infos: {
                            type: QuestType.enemy,
                            title: `Imboscata presso ${fight.nearCity.name}`,
                        },
                    },
                    enemies: catalog.enemies,
                    participants: [fighter],
                    equipment: catalog.equipment,
                    spells: catalog.spells,
                    loot: catalog.loot,
                });
                const battle = battleOf(
                    this.combat.resolve(context, this.chance),
                    identity.characterId,
                );
                if (!battle) throw new Error('ambush combat without a verdict');
                const plan = planAmbushOutcome({
                    snapshot: fighter,
                    food,
                    identity,
                    resultId,
                    userId: fight.userId,
                    verdict: battle.verdict,
                    effects: battle.effects,
                    enemies: enemyFactsOf(catalog) ?? { entries: [], xp: 0 },
                    victory: victoryKnowledgeOf(catalog),
                    nearCity: fight.nearCity,
                    nextAmbush: fight.next,
                    detour: fight.detour,
                    spellRecoveryTimes: catalog.recoveryTimes,
                    petMaxXp: catalog.petMaxXp,
                    now,
                });
                await this.writer.writeCharacterUpdate(
                    plan.filter,
                    plan.update,
                    session,
                );
                if (battle.verdict === 'failure') {
                    await this.abandonLane(inSession, session);
                }
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
        if (outcome.plan.report.outcome === QuestOutcome.failure) {
            return this.afterDefeat(fight, outcome.plan);
        }
        await this.afterCommit(
            identity.characterId,
            outcome.plan.travelAfter,
            now,
        );
        this.logger.log(`Imboscata ${jobId} risolta: won`);
        return 'won';
    }

    // D-11: abandonQuest non vale in viaggio (il suo filtro vuole arrivedAt); party sciolto = corsia già vuota, niente da fare
    private async abandonLane(
        snapshot: AmbushCharacter,
        session: ClientSession,
    ): Promise<void> {
        const pendingQuestId = snapshot.quests?.pendingQuest;
        if (!pendingQuestId) return;
        const pending = await this.pendingQuestModel
            .findOne({ _id: pendingQuestId }, { quest: 1 })
            .session(session)
            .lean<{ _id: Types.ObjectId; quest?: Types.ObjectId } | null>()
            .exec();
        if (!pending) return;
        await this.pendingQuestModel
            .deleteOne({ _id: pending._id }, { session })
            .exec();
        if (!pending.quest) return;
        const release = unstartedSeatReleaseOf([pending.quest], snapshot._id);
        await this.questModel
            .updateMany(release.filter, release.update, { session })
            .exec();
    }

    // a ogni sconfitta, anche verso la meta (D-12); nessuna imboscata sulla deviazione (D-03)
    private async afterDefeat(
        fight: Fight,
        plan: AmbushOutcomePlan,
    ): Promise<AmbushOutcome> {
        const { identity, jobId, detour } = fight;
        await this.push.sendToUser(
            fight.userId,
            ambushDefeat(
                identity.characterId.toHexString(),
                detour.reachedCity.name,
            ),
        );
        await this.scheduler.cancel(identity.characterId, identity.startTime);
        await this.scheduler.schedule(identity.characterId, plan.travelAfter);
        this.logger.log(
            `Imboscata ${jobId} risolta: lost verso ${detour.reachedCity.name}`,
        );
        return 'lost';
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
