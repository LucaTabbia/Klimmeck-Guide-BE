import type { Connection, Model, Schema } from 'mongoose';
import { Types } from 'mongoose';
import { City, CitySchema } from 'src/models/city.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Road, RoadSchema } from 'src/models/road.model';
import type { RoadsService } from 'src/roads/roads.service';
import { persistCity, persistPoi, persistRoad } from '../fixtures';

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
