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

export const TRAVEL_WORLD_ROAD_SPEED = 5;

export interface TravelWorld {
    cityA: Types.ObjectId;
    cityB: Types.ObjectId;
    cityC: Types.ObjectId;
    markerA: Types.ObjectId;
    markerB: Types.ObjectId;
    markerC: Types.ObjectId;
    questPoi: Types.ObjectId;
    farQuestPoi: Types.ObjectId;
}

function modelOf(
    connection: Connection,
    name: string,
    schema: Schema,
): Model<any> {
    return connection.models[name] ?? connection.model(name, schema);
}

// mappa minima: A–B collegate, quest POI collegato ad A, C e farQuestPoi isolati (nessun percorso)
export async function persistTravelWorld(
    connection: Connection,
    roads: RoadsService,
): Promise<TravelWorld> {
    const pois = modelOf(
        connection,
        PointOfInterest.name,
        PointOfInterestSchema,
    );
    const cities = modelOf(connection, City.name, CitySchema);
    const roadModel = modelOf(connection, Road.name, RoadSchema);
    const cityA = new Types.ObjectId();
    const cityB = new Types.ObjectId();
    const cityC = new Types.ObjectId();
    const poiAt = async (
        location: [number, number],
        type: string,
        city: Types.ObjectId,
    ): Promise<Types.ObjectId> =>
        (await persistPoi(pois, { location, type, city }))
            ._id as Types.ObjectId;
    const markerA = await poiAt([0, 0], 'city', cityA);
    const markerB = await poiAt([0, 0.2], 'city', cityB);
    const markerC = await poiAt([10, 10], 'city', cityC);
    const questPoi = await poiAt([0.1, 0], 'dungeon', cityA);
    const farQuestPoi = await poiAt([5, 5], 'ruins', cityA);
    await persistRoad(roadModel, {
        coordinates: [
            [0, 0],
            [0, 0.1],
            [0, 0.2],
        ],
        length: 1,
        speedFactor: TRAVEL_WORLD_ROAD_SPEED,
    });
    await persistRoad(roadModel, {
        coordinates: [
            [0, 0],
            [0.1, 0],
        ],
        length: 1,
        speedFactor: TRAVEL_WORLD_ROAD_SPEED,
    });
    await persistCity(cities, {
        _id: cityA,
        name: 'Travel City A',
        markerLocation: markerA,
        pointsOfInterest: [markerA, questPoi, farQuestPoi],
    });
    await persistCity(cities, {
        _id: cityB,
        name: 'Travel City B',
        markerLocation: markerB,
        pointsOfInterest: [markerB],
    });
    await persistCity(cities, {
        _id: cityC,
        name: 'Travel City C',
        markerLocation: markerC,
        pointsOfInterest: [markerC],
    });
    // il grafo si costruisce in onModuleInit col DB vuoto: va ricostruito dopo le strade (Pitfall 1)
    await roads.buildGraph();
    return {
        cityA,
        cityB,
        cityC,
        markerA,
        markerB,
        markerC,
        questPoi,
        farQuestPoi,
    };
}
