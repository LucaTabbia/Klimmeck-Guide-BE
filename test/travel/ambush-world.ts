import type { Connection, Model, Schema } from 'mongoose';
import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { TitleType } from 'src/models/enums/title-type.enum';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Road, RoadSchema } from 'src/models/road.model';
import { levelRowFor } from 'src/quests/outcomes/progression/level-table';
import { gameDistanceKm } from 'src/roads/game-distance';
import type { LonLat } from 'src/roads/road-route';
import type { RoadsService } from 'src/roads/roads.service';
import { durationMsOf } from 'src/travel/travel-timing';
import type { AmbushIdentity } from 'src/travel/ambush/ambush-job';
import type { AuthTestApp } from '../auth/auth-test-app';
import { createPlayer, type TestPlayer } from '../authz/player-fixture';
import {
    buildCharacter,
    persistCity,
    persistEnemy,
    persistLore,
    persistPoi,
    persistRoad,
} from '../fixtures';

// mondo delle imboscate (Phase 15), km di gioco da gameDistanceKm (1° di latitudine ≈ 2,224 km), speedFactor 1 (1 km = 1 h):
// R1 Alba [0, 0] → bivio [0, 4.5] → questPoi [0, 6.75] → Borgo [0, 9]: 20,015 km (Alba → questPoi 15,011 km);
// R2 bivio → Crocevia [2, 4.5]: 4,434 km; R3 Alba → Erta [-4, 0]: 8,896 km (sotto i 10 km, D-03);
// forestPoi di Crocevia in [0.3, 4.5], fuori strada: POI di zona per i nemici del piano 06
export const AMBUSH_WORLD_ROAD_SPEED = 1;

export interface AmbushWorldCities {
    alba: Types.ObjectId;
    borgo: Types.ObjectId;
    crocevia: Types.ObjectId;
    erta: Types.ObjectId;
}

export interface AmbushWorld {
    cities: AmbushWorldCities;
    markers: AmbushWorldCities;
    questPoi: Types.ObjectId;
    forestPoi: Types.ObjectId;
}

type CityName = keyof AmbushWorldCities;

const CITY_NAMES: Record<CityName, string> = {
    alba: 'Alba',
    borgo: 'Borgo',
    crocevia: 'Crocevia',
    erta: 'Erta',
};

const MARKER_LOCATIONS: Record<CityName, [number, number]> = {
    alba: [0, 0],
    borgo: [0, 9],
    crocevia: [2, 4.5],
    erta: [-4, 0],
};

const ROADS: [number, number][][] = [
    [
        [0, 0],
        [0, 4.5],
        [0, 6.75],
        [0, 9],
    ],
    [
        [0, 4.5],
        [2, 4.5],
    ],
    [
        [0, 0],
        [-4, 0],
    ],
];

function modelOf(
    connection: Connection,
    name: string,
    schema: Schema,
): Model<any> {
    return connection.models[name] ?? connection.model(name, schema);
}

export async function persistAmbushWorld(
    connection: Connection,
    roads: RoadsService,
): Promise<AmbushWorld> {
    const pois = modelOf(
        connection,
        PointOfInterest.name,
        PointOfInterestSchema,
    );
    const cityModel = modelOf(connection, City.name, CitySchema);
    const roadModel = modelOf(connection, Road.name, RoadSchema);
    const names = Object.keys(CITY_NAMES) as CityName[];
    const cities = Object.fromEntries(
        names.map((name) => [name, new Types.ObjectId()]),
    ) as unknown as AmbushWorldCities;
    const poiAt = async (
        location: [number, number],
        type: string,
        city: Types.ObjectId,
    ): Promise<Types.ObjectId> =>
        (await persistPoi(pois, { location, type: [type], city }))
            ._id as Types.ObjectId;
    const markers = {} as AmbushWorldCities;
    for (const name of names)
        markers[name] = await poiAt(
            MARKER_LOCATIONS[name],
            'city',
            cities[name],
        );
    const questPoi = await poiAt([0, 6.75], 'ruins', cities.alba);
    const forestPoi = await poiAt([0.3, 4.5], 'forest', cities.crocevia);
    for (const coordinates of ROADS)
        await persistRoad(roadModel, {
            coordinates,
            length: 1,
            speedFactor: AMBUSH_WORLD_ROAD_SPEED,
        });
    const extraPois: Partial<Record<CityName, Types.ObjectId[]>> = {
        alba: [questPoi],
        crocevia: [forestPoi],
    };
    for (const name of names)
        await persistCity(cityModel, {
            _id: cities[name],
            name: CITY_NAMES[name],
            markerLocation: markers[name],
            pointsOfInterest: [markers[name], ...(extraPois[name] ?? [])],
        });
    // il grafo si costruisce in onModuleInit col DB vuoto: va ricostruito dopo le strade (Pitfall 1)
    await roads.buildGraph();
    return { cities, markers, questPoi, forestPoi };
}

export interface AmbushEnemies {
    wolf: Types.ObjectId;
    bandit: Types.ObjectId;
    legend: Types.ObjectId;
    drake: Types.ObjectId;
}

// creati in quest'ordine (id crescenti): nei pool ordinati per id il lupo precede il bandito;
// fascia del livello 1 = 4–7 (D-08): lupo e bandito singoli, il drago (50) mai singolo sotto il livello 8
export async function persistAmbushEnemies(
    connection: Connection,
): Promise<AmbushEnemies> {
    const enemies = modelOf(connection, Enemy.name, EnemySchema);
    const lore = modelOf(connection, Lore.name, LoreSchema);
    const bestiary = await persistLore(lore, {
        type: 'animal',
        name: 'Bestiario della strada',
    });
    const enemyOf = async (
        overrides: Record<string, unknown>,
    ): Promise<Types.ObjectId> =>
        (
            await persistEnemy(enemies, {
                baseWeaknesses: ['cut'],
                legendary: false,
                ...overrides,
            })
        )._id as Types.ObjectId;
    const wolf = await enemyOf({
        name: 'Lupo della strada',
        xp: 5,
        locations: ['forest'],
        relatedLore: [bestiary._id],
    });
    const bandit = await enemyOf({
        name: 'Bandito di città',
        xp: 6,
        locations: ['city'],
    });
    const legend = await enemyOf({
        name: 'Leggenda del bosco',
        xp: 5,
        locations: ['forest'],
        legendary: true,
    });
    const drake = await enemyOf({
        name: 'Drago errante',
        xp: 50,
        locations: ['all'],
    });
    return { wolf, bandit, legend, drake };
}

const R1 = ROADS[0];

export const AMBUSH_ROUTE_KM = R1.slice(1).reduce(
    (total, point, index) => total + gameDistanceKm(R1[index], point),
    0,
);

// speedFactor 1 e velocità base: ore = km (Phase 8 D-07)
export const AMBUSH_ROUTE_DURATION_MS = durationMsOf(AMBUSH_ROUTE_KM, 10);

export interface TravellerOptions {
    twitchId: string;
    km: number;
    startTime: Date;
    title?: TitleType;
    xp?: number;
    hp?: number;
    characterOverrides?: {
        status?: Record<string, unknown>;
        assets?: Record<string, unknown>;
    };
    reports?: unknown[];
}

export interface Traveller {
    player: TestPlayer;
    characterId: Types.ObjectId;
    identity: AmbushIdentity;
    travel: Record<string, unknown>;
}

// in viaggio libero su R1 Alba → Borgo con l'imboscata pendente al km (istante come drawAmbush, D-01)
export async function persistTraveller(
    harness: AuthTestApp,
    world: AmbushWorld,
    options: TravellerOptions,
): Promise<Traveller> {
    const startMs = options.startTime.getTime();
    const at = new Date(
        startMs +
            Math.floor(
                (options.km / AMBUSH_ROUTE_KM) * AMBUSH_ROUTE_DURATION_MS,
            ),
    );
    const travel = {
        road: {
            coordinates: R1.map(([lon, lat]): LonLat => [lon, lat]),
            distance: AMBUSH_ROUTE_KM,
        },
        startTime: options.startTime,
        endTime: new Date(startMs + AMBUSH_ROUTE_DURATION_MS),
        duration: AMBUSH_ROUTE_DURATION_MS,
        to: world.markers.borgo,
        kind: TravelKind.free,
        ambush: { at, km: options.km, attempts: 0 },
        ...(options.reports ? { ambushReports: options.reports } : {}),
    };
    const base = buildCharacter();
    const xp = options.xp ?? 0;
    const row = levelRowFor(xp);
    const { status, assets } = options.characterOverrides ?? {};
    const player = await createPlayer(harness, {
        twitchId: options.twitchId,
        characterOverrides: {
            status: {
                ...base.status,
                xp,
                level: row.level,
                maxLifePoints: row.maxLifePoints,
                currentLifePoints: options.hp ?? row.maxLifePoints,
                title: options.title ?? TitleType.rookie,
                location: world.markers.alba,
                ...status,
                activeTravel: travel,
            },
            assets: { ...base.assets, ...assets },
        },
    });
    const characterId = player.character!._id as Types.ObjectId;
    return {
        player,
        characterId,
        identity: { characterId, startTime: options.startTime, at },
        travel,
    };
}

// tiri della SequenceChance (fallback 0.99 = mai un colpo, D-01): mancati sotto ogni rischio, colpo sotto ogni rischio
export const AMBUSH_MISS = 0.99;
export const AMBUSH_HIT = 0;
// composizione dell'imboscata: forma singola, primo candidato del pool ordinato per id
export const SINGLE_FIRST_CANDIDATE: readonly number[] = [0, 0];

// un tiro per km intero dopo fromKm, colpo al km: la partenza tira da 0, il risorteggio dal km dell'imboscata (D-02)
export function rollsHittingKm(km: number, fromKm = 0): number[] {
    return [
        ...Array.from({ length: km - fromKm - 1 }, () => AMBUSH_MISS),
        AMBUSH_HIT,
    ];
}
