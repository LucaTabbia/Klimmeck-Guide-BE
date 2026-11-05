import { getQueueToken } from '@nestjs/bull';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { LootItem } from 'src/models/loot-item.model';
import type { RoadRoute } from 'src/roads/road-route';
import { RoadsService } from 'src/roads/roads.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { foodNeededFor, hpLostFor, uncoveredKmOf } from './food/travel-food';
import { travelJobId, TRAVEL_QUEUE } from './travel-job';
import { TravelPlanner } from './travel-planner.service';
import { BASE_SPEED, durationMsOf } from './travel-timing';
import { TravelModule } from './travel.module';
import { TravelService } from './travel.service';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { createPlayer } from '../../test/authz/player-fixture';
import { buildCharacter } from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';
import {
    foodStack,
    HARDY_LIFE_POINTS,
    persistFood,
} from '../../test/travel/travel-food.fixture';
import {
    persistTravelWorld,
    TravelWorld,
} from '../../test/travel/travel-world';

const STARTED_AT = new Date('2026-10-21T10:00:00.000Z');

describe('TravelService (replSet)', () => {
    let harness: AuthTestApp;
    let travel: TravelService;
    let planner: TravelPlanner;
    let roads: RoadsService;
    let characters: Model<CharacterDocument>;
    let world: TravelWorld;
    let seq = 0;
    const queue = new FakeTravelQueue();
    const questQueue = new FakeTravelQueue();

    beforeAll(async () => {
        harness = await createAuthTestApp({
            clock: new FixedClock(STARTED_AT),
            imports: [TravelModule],
            overrides: [
                { token: getQueueToken(TRAVEL_QUEUE), useValue: queue },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: questQueue,
                },
                { token: PushTransport, useValue: new FakePushTransport() },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
            ],
        });
        travel = harness.app.get(TravelService);
        planner = harness.app.get(TravelPlanner);
        roads = harness.app.get(RoadsService);
        characters = harness.app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        await characters.init();
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        world = await persistTravelWorld(harness.connection, roads);
        queue.reset();
        questQueue.reset();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    // HP robusti di default (Phase 14 D-18): le partenze riuscite non dipendono dal cibo
    async function characterAt(
        location: Types.ObjectId,
        options: {
            lifePoints?: number;
            ownedItems?: unknown[];
            pet?: unknown;
            injuries?: string[];
        } = {},
    ): Promise<Types.ObjectId> {
        seq += 1;
        const base = buildCharacter();
        const lifePoints = options.lifePoints ?? HARDY_LIFE_POINTS;
        const player = await createPlayer(harness, {
            twitchId: `tw-travel-start-${seq}`,
            characterOverrides: {
                infos: { ...base.infos, name: `Viandante ${seq}` },
                status: {
                    ...base.status,
                    location,
                    activeTravel: null,
                    currentLifePoints: lifePoints,
                    maxLifePoints: lifePoints,
                    injuries: options.injuries ?? [],
                },
                assets: {
                    ...base.assets,
                    ownedItems: options.ownedItems ?? [],
                    pet: options.pet ?? null,
                },
            },
        });
        return player.character!._id as Types.ObjectId;
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function expectedDuration(): number {
        const route = roads.routeBetween([0, 0], [0, 0.2]) as RoadRoute;
        return durationMsOf(route.baseHours, BASE_SPEED);
    }

    // la corsa: un altro movimento scrive fra il piano e l'update condizionale
    function raceAfterPlanning(update: Record<string, unknown>) {
        const original = planner.planFree.bind(planner);
        jest.spyOn(planner, 'planFree').mockImplementation(
            async (characterId, poiId) => {
                const plan = await original(characterId, poiId);
                await characters.updateOne(
                    { _id: characterId },
                    { $set: update },
                );
                return plan;
            },
        );
    }

    it('starts a free travel and enqueues its completion', async () => {
        const id = await characterAt(world.markerA);

        await expect(
            travel.startTravel(id, world.markerB),
        ).resolves.toBeUndefined();

        const raw = await rawCharacter(id);
        expect(raw?.status.activeTravel).toMatchObject({
            kind: 'free',
            to: world.markerB,
            startTime: STARTED_AT,
            duration: expectedDuration(),
        });
        expect(raw?.status.location).toEqual(world.markerA);
        expect(queue.added).toHaveLength(1);
        expect(queue.added[0].options.jobId).toBe(travelJobId(id, STARTED_AT));
    });

    it('lets exactly one of two concurrent starts win', async () => {
        const id = await characterAt(world.markerA);

        const results = await Promise.allSettled([
            travel.startTravel(id, world.markerB),
            travel.startTravel(id, world.markerB),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toMatchObject({
            code: 'TRAVEL_IN_PROGRESS',
        });
        expect(queue.added).toHaveLength(1);
    });

    it('rejects with TRAVEL_IN_PROGRESS when another movement wins the race', async () => {
        const id = await characterAt(world.markerA);
        raceAfterPlanning({
            'status.activeTravel': {
                road: { coordinates: [[0, 0]], distance: 1 },
                startTime: STARTED_AT,
                endTime: new Date(STARTED_AT.getTime() + 60_000),
                duration: 60_000,
                to: world.markerB,
                kind: 'free',
            },
        });

        await expect(
            travel.startTravel(id, world.markerB),
        ).rejects.toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
        expect(queue.added).toEqual([]);
    });

    it('rejects with QUEST_IN_PROGRESS when a quest is claimed in the race', async () => {
        const id = await characterAt(world.markerA);
        raceAfterPlanning({ 'quests.pendingQuest': new Types.ObjectId() });

        await expect(
            travel.startTravel(id, world.markerB),
        ).rejects.toMatchObject({ code: 'QUEST_IN_PROGRESS' });
        expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
        expect(queue.added).toEqual([]);
    });

    it('writes nothing and enqueues nothing on a rejection', async () => {
        const id = await characterAt(world.markerA);

        await expect(
            travel.startTravel(id, world.questPoi),
        ).rejects.toMatchObject({ code: 'TRAVEL_DESTINATION_NOT_ALLOWED' });

        expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
        expect(queue.added).toEqual([]);
    });

    it('previews the same numbers without writing', async () => {
        const id = await characterAt(world.markerA);
        const route = roads.routeBetween([0, 0], [0, 0.2]) as RoadRoute;

        const preview = await travel.preview(id, world.markerB);

        expect(preview.road.coordinates).toEqual(route.coordinates);
        expect(preview.distance).toBe(route.distanceKm);
        expect(preview.road.distance).toBe(route.distanceKm);
        expect(preview.duration).toBe(expectedDuration());
        expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
        expect(queue.added).toEqual([]);

        await travel.startTravel(id, world.markerB);
        expect((await rawCharacter(id))?.status.activeTravel.duration).toBe(
            preview.duration,
        );
    });

    it.each([
        ['questPoi', 'TRAVEL_DESTINATION_NOT_ALLOWED'],
        ['markerA', 'TRAVEL_SAME_LOCATION'],
        ['markerC', 'TRAVEL_NO_PATH'],
    ] as const)(
        'previews with the same rejection codes (%s ⇒ %s)',
        async (destination, code) => {
            const id = await characterAt(world.markerA);

            await expect(
                travel.preview(id, world[destination]),
            ).rejects.toMatchObject({ code });
            expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
        },
    );

    it('keeps the travel when the queue is unavailable', async () => {
        const id = await characterAt(world.markerA);
        queue.failAdd = true;

        await expect(
            travel.startTravel(id, world.markerB),
        ).resolves.toBeUndefined();

        expect((await rawCharacter(id))?.status.activeTravel).toMatchObject({
            to: world.markerB,
        });
    });

    describe('food at departure (D-12)', () => {
        let lootItems: Model<any>;
        let route: RoadRoute;
        let needed: number;

        beforeEach(() => {
            lootItems = harness.app.get<Model<any>>(
                getModelToken(LootItem.name),
            );
            route = roads.routeBetween([0, 0], [0, 0.2]) as RoadRoute;
            needed = foodNeededFor(expectedDuration());
        });

        it('eats the selected food at departure and keeps the life points when covered (D-06, D-12)', async () => {
            expect(needed).toBeGreaterThan(0);
            expect(needed).toBeLessThan(5);
            const food1 = await persistFood(lootItems, 1);
            const food5 = await persistFood(lootItems, 5);
            const id = await characterAt(world.markerA, {
                lifePoints: 100,
                ownedItems: [foodStack(food1, needed), foodStack(food5, 1)],
            });

            await expect(
                travel.startTravel(id, world.markerB),
            ).resolves.toBeUndefined();

            const raw = await rawCharacter(id);
            expect(raw?.assets.ownedItems).toEqual([foodStack(food5, 1)]);
            expect(raw?.status.currentLifePoints).toBe(100);
            expect(raw?.status.activeTravel).toMatchObject({
                to: world.markerB,
            });
            expect(queue.added).toHaveLength(1);
        });

        it('eats all the food and lowers the life points on a partial cover (D-03, D-04)', async () => {
            expect(needed).toBeGreaterThan(1);
            const food1 = await persistFood(lootItems, 1);
            const id = await characterAt(world.markerA, {
                lifePoints: HARDY_LIFE_POINTS,
                ownedItems: [foodStack(food1, 1)],
            });

            await travel.startTravel(id, world.markerB);

            const raw = await rawCharacter(id);
            expect(raw?.assets.ownedItems).toEqual([]);
            expect(raw?.status.currentLifePoints).toBe(
                HARDY_LIFE_POINTS -
                    hpLostFor(uncoveredKmOf(needed, 1, route.distanceKm)),
            );
            expect(raw?.status.currentLifePoints).toBeLessThan(
                HARDY_LIFE_POINTS,
            );
        });

        it('charges the life of the whole road without food (D-02)', async () => {
            const id = await characterAt(world.markerA, {
                lifePoints: HARDY_LIFE_POINTS,
            });

            await travel.startTravel(id, world.markerB);

            const hpLost = hpLostFor(
                uncoveredKmOf(needed, 0, route.distanceKm),
            );
            expect(hpLost).toBeGreaterThan(0);
            expect((await rawCharacter(id))?.status.currentLifePoints).toBe(
                HARDY_LIFE_POINTS - hpLost,
            );
        });

        it('refuses a starving departure with TRAVEL_STARVING and writes nothing (D-11)', async () => {
            const food1 = await persistFood(lootItems, 1);
            const id = await characterAt(world.markerA, {
                lifePoints: 1,
                ownedItems: [foodStack(food1, 1)],
            });
            const before = await rawCharacter(id);

            await expect(
                travel.startTravel(id, world.markerB),
            ).rejects.toMatchObject({ code: 'TRAVEL_STARVING' });

            expect(await rawCharacter(id)).toEqual(before);
            expect(queue.added).toEqual([]);
        });

        it('answers the race code before the hunger when another movement wins (D-11)', async () => {
            const id = await characterAt(world.markerA, { lifePoints: 1 });
            raceAfterPlanning({
                'status.activeTravel': {
                    road: { coordinates: [[0, 0]], distance: 1 },
                    startTime: STARTED_AT,
                    endTime: new Date(STARTED_AT.getTime() + 60_000),
                    duration: 60_000,
                    to: world.markerB,
                    kind: 'free',
                },
            });

            await expect(
                travel.startTravel(id, world.markerB),
            ).rejects.toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
            expect(queue.added).toEqual([]);
        });
    });
});
