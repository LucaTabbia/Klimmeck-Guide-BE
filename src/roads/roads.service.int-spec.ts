import { INestApplication } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Road } from 'src/models/road.model';
import { PointOfInterestsService } from 'src/pointsOfInterest/point-of-interest.service';
import { persistPoi } from '../../test/fixtures/poi.fixture';
import { persistRoad } from '../../test/fixtures/road.fixture';
import { LonLat } from './road-route';
import { RoadsModule } from './roads.module';
import { RoadsService } from './roads.service';

// copia del calcolo del service (R = 127.42), solo per gli attesi
const R = 127.42;
const toRad = (degrees: number) => degrees * (Math.PI / 180);
function km([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
    const h =
        Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(toRad(lon2 - lon1) / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const STRAIGHT: LonLat[] = [
    [0, 0],
    [0, 0.1],
    [0, 0.2],
];
const STRAIGHT_KM = km([0, 0], [0, 0.1]) + km([0, 0.1], [0, 0.2]);

/**
 * INTEGRATION: RoadsModule imported on its own (no global MongoModule, C3) on the
 * shared replSet; the graph is rebuilt after each case persists its roads (Pitfall 1).
 */
describe('RoadsService.routeBetween (replSet)', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let roads: RoadsService;
    let roadModel: Model<any>;
    let poiModel: Model<any>;

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'roads-test',
                }),
                RoadsModule,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        roads = moduleRef.get(RoadsService);
        roadModel = moduleRef.get<Model<any>>(getModelToken(Road.name));
        poiModel = moduleRef.get<Model<any>>(
            getModelToken(PointOfInterest.name),
        );
    }, 120000);

    beforeEach(async () => {
        await Promise.all([roadModel.deleteMany({}), poiModel.deleteMany({})]);
    });

    afterAll(async () => {
        if (app) {
            await Promise.all([
                roadModel.deleteMany({}),
                poiModel.deleteMany({}),
            ]);
            await app.close();
        }
    });

    async function withRoads(
        ...defs: { coordinates: LonLat[]; speedFactor: number }[]
    ) {
        for (const def of defs) {
            await persistRoad(roadModel, { ...def, length: 1 });
        }
        await roads.buildGraph();
    }

    it('routes along two exact nodes', async () => {
        await withRoads({ coordinates: STRAIGHT, speedFactor: 5 });

        const route = roads.routeBetween([0, 0], [0, 0.2]);

        expect(route).not.toBeNull();
        expect(route!.coordinates).toEqual(STRAIGHT);
        expect(route!.distanceKm).toBeCloseTo(STRAIGHT_KM, 9);
        expect(route!.baseHours).toBeCloseTo(route!.distanceKm / 5, 9);
    });

    it('orients the route from the start even on a road drawn backwards', async () => {
        await withRoads({
            coordinates: [...STRAIGHT].reverse(),
            speedFactor: 5,
        });

        const route = roads.routeBetween([0, 0], [0, 0.2]);

        expect(route!.coordinates).toEqual(STRAIGHT);
    });

    it('chains several roads', async () => {
        await withRoads(
            {
                coordinates: [
                    [0, 0],
                    [0, 0.1],
                ],
                speedFactor: 5,
            },
            {
                coordinates: [
                    [0.1, 0.1],
                    [0, 0.1],
                ],
                speedFactor: 2,
            },
        );

        const route = roads.routeBetween([0, 0], [0.1, 0.1]);

        const km1 = km([0, 0], [0, 0.1]);
        const km2 = km([0, 0.1], [0.1, 0.1]);
        expect(route!.coordinates).toEqual([
            [0, 0],
            [0, 0.1],
            [0.1, 0.1],
        ]);
        expect(route!.distanceKm).toBeCloseTo(km1 + km2, 9);
        expect(route!.baseHours).toBeCloseTo(km1 / 5 + km2 / 2, 9);
    });

    it('snaps a point within 5 km and keeps it as the route end', async () => {
        await withRoads({ coordinates: STRAIGHT, speedFactor: 5 });

        const route = roads.routeBetween([0.01, 0], [0, 0.2]);

        expect(route!.coordinates[0]).toEqual([0.01, 0]);
        expect(route!.coordinates[1]).toEqual([0, 0]);
        expect(route!.coordinates).toHaveLength(4);
        expect(route!.distanceKm).toBeCloseTo(STRAIGHT_KM, 9);
    });

    it('answers null beyond the 5 km snap distance', async () => {
        await withRoads({ coordinates: STRAIGHT, speedFactor: 5 });

        expect(km([3, 0], [0, 0])).toBeGreaterThan(5);
        expect(roads.routeBetween([3, 0], [0, 0.2])).toBeNull();
    });

    it('answers null when start and end snap to the same node', async () => {
        await withRoads({ coordinates: STRAIGHT, speedFactor: 5 });

        expect(roads.routeBetween([0, 0], [0.001, 0])).toBeNull();
    });

    it('answers null without a connecting road', async () => {
        await withRoads(
            { coordinates: STRAIGHT, speedFactor: 5 },
            {
                coordinates: [
                    [10, 10],
                    [10, 10.1],
                ],
                speedFactor: 1,
            },
        );

        expect(roads.routeBetween([0, 0], [10, 10])).toBeNull();
    });

    it('answers null before the graph is built', () => {
        const unbuilt = new RoadsService(
            roadModel,
            moduleRef.get(PointOfInterestsService),
        );

        expect(unbuilt.routeBetween([0, 0], [0, 0.2])).toBeNull();
    });

    it('prefers the lightest of parallel roads', async () => {
        const parallel: LonLat[] = [
            [20, 20],
            [20, 20.1],
        ];
        await withRoads(
            { coordinates: parallel, speedFactor: 1 },
            { coordinates: parallel, speedFactor: 4 },
        );

        const route = roads.routeBetween([20, 20], [20, 20.1]);

        expect(route!.baseHours).toBeCloseTo(
            km(parallel[0], parallel[1]) / 4,
            9,
        );
    });

    it('keeps getShortestPath unchanged', async () => {
        await withRoads({ coordinates: STRAIGHT, speedFactor: 5 });
        const poiA = await persistPoi(poiModel, { location: [0, 0] });
        const poiB = await persistPoi(poiModel, { location: [0, 0.2] });

        const path = await roads.getShortestPath(
            String(poiA._id),
            String(poiB._id),
        );

        expect(path.distance).toBeCloseTo(STRAIGHT_KM, 9);
        expect(path.time).toBeCloseTo(STRAIGHT_KM / 5, 9);
    });
});
