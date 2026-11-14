import { getQueueToken } from '@nestjs/bull';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import {
    applyTradeToInventory,
    type InventoryEntry,
} from 'src/economy/trade/trade-inventory';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { LootItem } from 'src/models/loot-item.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Pet } from 'src/models/pet.model';
import { Road } from 'src/models/road.model';
import type { RoadRoute } from 'src/roads/road-route';
import { RoadsService } from 'src/roads/roads.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { travelSpeedFactorOf } from 'src/quests/outcomes/injuries/injury-rules';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { AMBUSH_JOB, ambushJobId } from './ambush/ambush-job';
import { TravelPantryReader } from './food/travel-pantry.reader';
import { foodNeededFor, hpLostFor, uncoveredKmOf } from './food/travel-food';
import { selectFood } from './food/food-selection';
import { mealLinesOf } from './food/travel-food.updates';
import { travelJobId, TRAVEL_QUEUE } from './travel-job';
import { TravelPlanner } from './travel-planner.service';
import { TravelSweeper } from './travel-sweeper';
import { BASE_SPEED, durationMsOf } from './travel-timing';
import { TravelModule } from './travel.module';
import { TravelService } from './travel.service';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import {
    buildCharacter,
    persistLootItem,
    persistPet,
} from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { SequenceChance } from '../../test/quests/sequence-chance';
import {
    AmbushWorld,
    persistAmbushWorld,
} from '../../test/travel/ambush-world';
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
const ONE_LEG = ['brokenLeftLeg'];
const LARDER = 500;
const SLOW_ROAD_SPEED = 3;

describe('TravelService (replSet)', () => {
    let harness: AuthTestApp;
    let travel: TravelService;
    let planner: TravelPlanner;
    let roads: RoadsService;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
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
        pendingQuests = harness.app.get<Model<PendingQuestDocument>>(
            getModelToken(PendingQuest.name),
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
            quests?: Record<string, unknown>;
        } = {},
    ): Promise<Types.ObjectId> {
        seq += 1;
        const base = buildCharacter();
        const lifePoints = options.lifePoints ?? HARDY_LIFE_POINTS;
        const player = await createPlayer(harness, {
            twitchId: `tw-travel-start-${seq}`,
            characterOverrides: {
                infos: { ...base.infos, name: `Viandante ${seq}` },
                quests: { ...base.quests, ...options.quests },
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

    async function laneOf(
        lane: QuestLane,
        dates: { startDate?: Date | null; missionDraftStartedAt?: Date | null },
    ): Promise<Record<string, Types.ObjectId>> {
        const pendingQuest = await pendingQuests.create({
            startDate: null,
            waitingTime: 60_000,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
            ...dates,
        });
        return { [lane]: pendingQuest._id as Types.ObjectId };
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

    describe('mission lock', () => {
        it('refuses to start a travel during a guided draft without writing (D-11)', async () => {
            const id = await characterAt(world.markerA, {
                quests: await laneOf(QuestLane.story, {
                    missionDraftStartedAt: STARTED_AT,
                }),
            });

            await expect(
                travel.startTravel(id, world.markerB),
            ).rejects.toMatchObject({ code: 'MISSION_IN_PROGRESS' });
            expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
            expect(queue.added).toEqual([]);
        });

        it('refuses the travel preview during a guided draft (D-23)', async () => {
            const id = await characterAt(world.markerA, {
                quests: await laneOf(QuestLane.story, {
                    missionDraftStartedAt: STARTED_AT,
                }),
            });

            await expect(
                travel.preview(id, world.markerB),
            ).rejects.toMatchObject({ code: 'MISSION_IN_PROGRESS' });
        });

        it('keeps the busy standard lane code first (D-23)', async () => {
            const id = await characterAt(world.markerA, {
                quests: await laneOf(QuestLane.standard, {
                    startDate: STARTED_AT,
                }),
            });

            await expect(
                travel.startTravel(id, world.markerB),
            ).rejects.toMatchObject({ code: 'QUEST_IN_PROGRESS' });
            await expect(
                travel.preview(id, world.markerB),
            ).rejects.toMatchObject({ code: 'QUEST_IN_PROGRESS' });
            expect(queue.added).toEqual([]);
        });

        it('lets a character with a story and no draft travel (D-11)', async () => {
            const id = await characterAt(world.markerA, {
                quests: await laneOf(QuestLane.story, {}),
            });

            await expect(
                travel.startTravel(id, world.markerB),
            ).resolves.toBeUndefined();
            expect((await rawCharacter(id))?.status.activeTravel).toMatchObject(
                { to: world.markerB },
            );
        });
    });

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

    describe('food plan at departure (D-05)', () => {
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

        function foodOf(id: Types.ObjectId) {
            return rawCharacter(id).then(
                (raw) => raw?.status.activeTravel.food,
            );
        }

        it('saves the food plan at departure and leaves food and life untouched when covered (D-05)', async () => {
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
            expect(raw?.assets.ownedItems).toEqual([
                foodStack(food1, needed),
                foodStack(food5, 1),
            ]);
            expect(raw?.status.currentLifePoints).toBe(100);
            expect(raw?.status.activeTravel).toMatchObject({
                to: world.markerB,
            });
            expect(raw?.status.activeTravel.food).toEqual({
                needed,
                uncoveredKm: 0,
                coveredKm: route.distanceKm,
                hpLostTotal: 0,
                settledKm: 0,
                foodConsumedAt: null,
            });
            expect(queue.added).toHaveLength(1);
        });

        it('saves the uncovered kilometres of a partial cover without eating nor charging (D-05, D-13)', async () => {
            expect(needed).toBeGreaterThan(1);
            const food1 = await persistFood(lootItems, 1);
            const id = await characterAt(world.markerA, {
                lifePoints: HARDY_LIFE_POINTS,
                ownedItems: [foodStack(food1, 1)],
            });

            await travel.startTravel(id, world.markerB);

            const raw = await rawCharacter(id);
            const uncoveredKm = uncoveredKmOf(needed, 1, route.distanceKm);
            expect(raw?.assets.ownedItems).toEqual([foodStack(food1, 1)]);
            expect(raw?.status.currentLifePoints).toBe(HARDY_LIFE_POINTS);
            expect(raw?.status.activeTravel.food).toMatchObject({
                needed,
                uncoveredKm,
                coveredKm: Math.max(0, route.distanceKm - uncoveredKm),
                hpLostTotal: hpLostFor(uncoveredKm),
            });
            expect(hpLostFor(uncoveredKm)).toBeGreaterThan(0);
        });

        it('saves the whole road as uncovered without food and keeps the life (D-05)', async () => {
            const id = await characterAt(world.markerA, {
                lifePoints: HARDY_LIFE_POINTS,
            });

            await travel.startTravel(id, world.markerB);

            const hpLost = hpLostFor(
                uncoveredKmOf(needed, 0, route.distanceKm),
            );
            expect(hpLost).toBeGreaterThan(0);
            expect((await rawCharacter(id))?.status.currentLifePoints).toBe(
                HARDY_LIFE_POINTS,
            );
            expect((await foodOf(id))?.hpLostTotal).toBe(hpLost);
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

        // dispensa abbondante: il fabbisogno salvato segue la marcia e la partenza non tocca la dispensa
        async function neededAtDeparture(options: {
            pet?: unknown;
            injuries?: string[];
        }): Promise<number> {
            const food1 = await persistFood(lootItems, 1);
            const id = await characterAt(world.markerA, {
                ...options,
                ownedItems: [foodStack(food1, LARDER)],
            });
            await travel.startTravel(id, world.markerB);
            const raw = await rawCharacter(id);
            expect(raw?.assets.ownedItems).toEqual([foodStack(food1, LARDER)]);
            return raw?.status.activeTravel.food.needed;
        }

        it('halves the food need with a mount of speed two (D-01)', async () => {
            const pets = harness.app.get<Model<any>>(getModelToken(Pet.name));
            const pet = await persistPet(pets, { speedModifier: 2 });
            const onFoot = foodNeededFor(
                durationMsOf(route.baseHours, BASE_SPEED),
            );
            const mounted = foodNeededFor(
                durationMsOf(route.baseHours, BASE_SPEED * 2),
            );

            expect(await neededAtDeparture({})).toBe(onFoot);
            expect(await neededAtDeparture({ pet: pet._id })).toBe(mounted);
            expect(mounted).toBeLessThan(onFoot);
            expect(mounted).toBeLessThanOrEqual(Math.ceil(onFoot / 2));
        });

        it('raises the food need of an injured traveller with the slower march (D-01)', async () => {
            const injured = foodNeededFor(
                durationMsOf(
                    route.baseHours,
                    BASE_SPEED * travelSpeedFactorOf(ONE_LEG),
                ),
            );

            expect(await neededAtDeparture({ injuries: ONE_LEG })).toBe(
                injured,
            );
            expect(injured).toBeGreaterThan(needed);
        });

        it('needs more food on a slow road than on the plain (D-01)', async () => {
            const roadModel = harness.app.get<Model<any>>(
                getModelToken(Road.name),
            );
            await roadModel.updateMany(
                {},
                { $set: { speedFactor: SLOW_ROAD_SPEED } },
            );
            await roads.buildGraph();
            const slowRoute = roads.routeBetween([0, 0], [0, 0.2]) as RoadRoute;
            const slow = foodNeededFor(
                durationMsOf(slowRoute.baseHours, BASE_SPEED),
            );

            expect(await neededAtDeparture({})).toBe(slow);
            expect(slow).toBeGreaterThan(needed);
        });

        it('lets exactly one of two concurrent departures save its food plan (D-05, D-14)', async () => {
            const food1 = await persistFood(lootItems, 1);
            const food5 = await persistFood(lootItems, 5);
            const id = await characterAt(world.markerA, {
                lifePoints: 100,
                ownedItems: [foodStack(food1, needed), foodStack(food5, 1)],
            });

            const results = await Promise.allSettled([
                travel.startTravel(id, world.markerB),
                travel.startTravel(id, world.markerB),
            ]);

            const rejected = results.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected',
            );
            expect(
                results.filter((r) => r.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(rejected[0].reason).toMatchObject({
                code: 'TRAVEL_IN_PROGRESS',
            });
            expect((await rawCharacter(id))?.assets.ownedItems).toEqual([
                foodStack(food1, needed),
                foodStack(food5, 1),
            ]);
            expect((await foodOf(id))?.needed).toBe(needed);
            expect(queue.added).toHaveLength(1);
        });

        it('keeps a concurrent purchase made after the pantry read without eating at departure (D-05, D-14)', async () => {
            const pantryReader = harness.app.get(TravelPantryReader);
            const food1 = await persistFood(lootItems, 1);
            const potion = await persistLootItem(lootItems, {
                name: 'Pozione di prova',
            });
            const id = await characterAt(world.markerA, {
                lifePoints: 100,
                ownedItems: [foodStack(food1, needed + 3)],
            });
            const original = pantryReader.read.bind(pantryReader);
            let purchased = false;
            const read = jest
                .spyOn(pantryReader, 'read')
                .mockImplementation(async (characterId, session) => {
                    const pantry = await original(characterId, session);
                    if (!purchased) {
                        purchased = true;
                        await characters.updateOne(
                            { _id: characterId },
                            {
                                $push: {
                                    'assets.ownedItems': foodStack(potion, 1),
                                },
                            },
                        );
                    }
                    return pantry;
                });

            await expect(
                travel.startTravel(id, world.markerB),
            ).resolves.toBeUndefined();

            expect((await rawCharacter(id))?.assets.ownedItems).toEqual([
                foodStack(food1, needed + 3),
                foodStack(potion, 1),
            ]);
            expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });
});

const WIRE_TRAVEL_QUERY =
    'query($id: String!) { character(id: $id) { status { activeTravel { road { coordinates distance } startTime endTime duration to } } } }';

// mondo ≥ 10 km e caso a sequenza (Phase 15): harness proprio, i casi di Phase 8/14 restano sul travel world
describe('TravelService ambush at departure (Phase 15)', () => {
    let harness: AuthTestApp;
    let travel: TravelService;
    let roads: RoadsService;
    let world: AmbushWorld;
    let seq = 0;
    const queue = new FakeTravelQueue();
    const chance = new SequenceChance();

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            clock: new FixedClock(STARTED_AT),
            imports: [TravelModule],
            overrides: [
                { token: getQueueToken(TRAVEL_QUEUE), useValue: queue },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
                { token: PushTransport, useValue: new FakePushTransport() },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
                { token: ChanceSource, useValue: chance },
            ],
        });
        travel = harness.app.get(TravelService);
        roads = harness.app.get(RoadsService);
        await harness.app
            .get<Model<CharacterDocument>>(getModelToken(Character.name))
            .init();
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        world = await persistAmbushWorld(harness.connection, roads);
        queue.reset();
        // la prima estrazione colpisce sempre: imboscata al km 1 se la strada la ammette
        chance.load([0]);
    });

    afterAll(async () => {
        await harness.close();
    });

    async function playerAtAlba(): Promise<TestPlayer> {
        seq += 1;
        const base = buildCharacter();
        return createPlayer(harness, {
            twitchId: `tw-travel-ambush-${seq}`,
            characterOverrides: {
                infos: { ...base.infos, name: `Viandante imboscato ${seq}` },
                status: {
                    ...base.status,
                    location: world.markers.alba,
                    activeTravel: null,
                    currentLifePoints: HARDY_LIFE_POINTS,
                    maxLifePoints: HARDY_LIFE_POINTS,
                    injuries: [],
                },
                assets: { ...base.assets, ownedItems: [], pet: null },
            },
        });
    }

    function idOf(player: TestPlayer): Types.ObjectId {
        return player.character!._id as Types.ObjectId;
    }

    function rawTravel(id: Types.ObjectId) {
        return harness.connection
            .collection('characters')
            .findOne({ _id: id })
            .then((raw) => raw?.status.activeTravel);
    }

    it('writes the drawn ambush into the departure and enqueues its trigger (D-05)', async () => {
        const id = idOf(await playerAtAlba());

        await travel.startTravel(id, world.markers.borgo);

        const active = await rawTravel(id);
        const at = new Date(
            STARTED_AT.getTime() +
                Math.floor((1 / active.road.distance) * active.duration),
        );
        expect(active.ambush).toEqual({ at, km: 1, attempts: 0 });
        expect(queue.added.map(({ name }) => name)).toEqual([
            'complete',
            AMBUSH_JOB,
        ]);
        expect(queue.added[1].options.jobId).toBe(
            ambushJobId(id, STARTED_AT, at),
        );
    });

    it('keeps the wire travel identical with an ambush pending (D-05, D-15)', async () => {
        const player = await playerAtAlba();
        await travel.startTravel(idOf(player), world.markers.borgo);

        const response = await graphqlRequest(
            harness.app,
            WIRE_TRAVEL_QUERY,
            { id: idOf(player).toHexString() },
            player.bearer,
        );

        expect(response.body.errors).toBeUndefined();
        expect((await rawTravel(idOf(player))).ambush?.km).toBe(1);
        expect(
            Object.keys(
                response.body.data.character.status.activeTravel as object,
            ).sort(),
        ).toEqual(['duration', 'endTime', 'road', 'startTime', 'to']);
    });

    it('draws nothing under ten km and writes no ambush field (D-03)', async () => {
        const id = idOf(await playerAtAlba());

        await travel.startTravel(id, world.markers.erta);

        const active = await rawTravel(id);
        expect(chance.drawn.length).toBe(0);
        expect(Object.keys(active as object).sort()).toEqual([
            'duration',
            'endTime',
            'food',
            'kind',
            'road',
            'startTime',
            'to',
        ]);
        expect(queue.added.map(({ name }) => name)).toEqual(['complete']);
    });

    it('never draws on the travel preview (D-15)', async () => {
        const id = idOf(await playerAtAlba());

        await travel.preview(id, world.markers.borgo);

        expect(chance.drawn.length).toBe(0);
    });
});

const END_TO_END_STEPS = 7;
const MILLISECONDS_PER_SECOND = 1000;

// uno scatto dello sweep: food nullo = viaggio già chiuso dall'arrivo
interface WalkStep {
    life: number;
    ownedItems: unknown[];
    food: { coveredKm: number; foodConsumedAt: Date | null } | null;
}

// partenza, sweep a scatti e arrivo veri (Phase 20): totali di fine viaggio identici alla Phase 14
describe('TravelService progressive food end to end (Phase 20)', () => {
    let harness: AuthTestApp;
    let travel: TravelService;
    let roads: RoadsService;
    let characters: Model<CharacterDocument>;
    let lootItems: Model<any>;
    let world: AmbushWorld;
    let seq = 0;
    const clock = new FixedClock(STARTED_AT);

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            clock,
            imports: [TravelModule],
            overrides: [
                {
                    token: getQueueToken(TRAVEL_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
                { token: PushTransport, useValue: new FakePushTransport() },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
                { token: ChanceSource, useValue: new SequenceChance() },
            ],
        });
        travel = harness.app.get(TravelService);
        roads = harness.app.get(RoadsService);
        characters = harness.app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        lootItems = harness.app.get<Model<any>>(getModelToken(LootItem.name));
        await Promise.all([characters.init(), lootItems.init()]);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        world = await persistAmbushWorld(harness.connection, roads);
        moveClockTo(STARTED_AT);
    });

    afterAll(async () => {
        await harness.close();
    });

    function moveClockTo(date: Date): void {
        clock.advanceSeconds(
            (date.getTime() - clock.now().getTime()) / MILLISECONDS_PER_SECOND,
        );
    }

    async function travellerAtAlba(): Promise<Types.ObjectId> {
        seq += 1;
        const base = buildCharacter();
        const player = await createPlayer(harness, {
            twitchId: `tw-travel-food-${seq}`,
            characterOverrides: {
                infos: { ...base.infos, name: `Viandante affamato ${seq}` },
                status: {
                    ...base.status,
                    location: world.markers.alba,
                    activeTravel: null,
                    currentLifePoints: HARDY_LIFE_POINTS,
                    maxLifePoints: HARDY_LIFE_POINTS,
                    injuries: [],
                },
                assets: { ...base.assets, ownedItems: [], pet: null },
            },
        });
        return player.character!._id as Types.ObjectId;
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    async function fillPantry(id: Types.ObjectId, ownedItems: unknown[]) {
        await characters.collection.updateOne(
            { _id: id },
            { $set: { 'assets.ownedItems': ownedItems } },
        );
    }

    // sette scatti dentro la durata, poi uno oltre la fine: l'ultimo sweep completa il viaggio
    async function walkToTheEnd(
        id: Types.ObjectId,
        duration: number,
    ): Promise<WalkStep[]> {
        const steps: WalkStep[] = [];
        const step = duration / END_TO_END_STEPS / MILLISECONDS_PER_SECOND;
        for (let i = 0; i <= END_TO_END_STEPS; i++) {
            clock.advanceSeconds(step);
            await harness.app.get(TravelSweeper).sweep();
            const raw = await rawCharacter(id);
            steps.push({
                life: raw?.status.currentLifePoints,
                ownedItems: raw?.assets.ownedItems,
                food: raw?.status.activeTravel?.food ?? null,
            });
        }
        return steps;
    }

    it('charges at the end of the road exactly the Phase 14 total, step by step (D-02, D-13)', async () => {
        const f1 = await persistFood(lootItems, 1);
        const id = await travellerAtAlba();
        const preview = await travel.preview(id, world.markers.borgo);
        const needed = foodNeededFor(preview.duration);
        const covered = Math.floor(needed / 2);
        const distance = preview.distance;
        await fillPantry(id, [foodStack(f1, covered)]);

        await travel.startTravel(id, world.markers.borgo);

        const departed = await rawCharacter(id);
        expect(departed?.status.activeTravel.food.needed).toBe(needed);
        expect(departed?.assets.ownedItems).toEqual([foodStack(f1, covered)]);
        expect(departed?.status.currentLifePoints).toBe(HARDY_LIFE_POINTS);

        const steps = await walkToTheEnd(id, preview.duration);

        const arrived = await rawCharacter(id);
        const hpLost = hpLostFor(uncoveredKmOf(needed, covered, distance));
        expect(hpLost).toBeGreaterThan(0);
        expect(arrived?.status.activeTravel).toBeNull();
        expect(arrived?.status.location).toEqual(world.markers.borgo);
        expect(HARDY_LIFE_POINTS - arrived?.status.currentLifePoints).toBe(
            hpLost,
        );
        expect(arrived?.assets.ownedItems).toEqual([]);
        const lives = steps.map(({ life }) => life);
        lives.forEach((life, i) =>
            expect(life).toBeLessThanOrEqual(lives[i - 1] ?? HARDY_LIFE_POINTS),
        );
        const open = steps.filter(({ food }) => food !== null);
        expect(open.some(({ life }) => life < HARDY_LIFE_POINTS)).toBe(true);
        expect(new Set(lives).size).toBeGreaterThan(2);
        const beforeMeal = open.filter(({ food }) => !food?.foodConsumedAt);
        const afterMeal = open.filter(({ food }) => food?.foodConsumedAt);
        expect(beforeMeal.length).toBeGreaterThan(0);
        expect(afterMeal.length).toBeGreaterThan(0);
        beforeMeal.forEach(({ ownedItems }) =>
            expect(ownedItems).toEqual([foodStack(f1, covered)]),
        );
        afterMeal.forEach(({ ownedItems }) => expect(ownedItems).toEqual([]));
    });

    it('eats on arrival the same food the Phase 14 ate at departure (D-03, D-13)', async () => {
        const f1 = await persistFood(lootItems, 1);
        const f5 = await persistFood(lootItems, 5);
        const id = await travellerAtAlba();
        const preview = await travel.preview(id, world.markers.borgo);
        const needed = foodNeededFor(preview.duration);
        const ownedItems = [foodStack(f1, needed), foodStack(f5, 2)];
        await fillPantry(id, ownedItems);
        const { stacks } = await harness.app.get(TravelPantryReader).read(id);
        const expected = applyTradeToInventory(
            { ownedItems: ownedItems as InventoryEntry[] },
            mealLinesOf(selectFood(needed, stacks).consumed),
        ).ownedItems;

        await travel.startTravel(id, world.markers.borgo);
        await walkToTheEnd(id, preview.duration);

        const arrived = await rawCharacter(id);
        expect(arrived?.status.activeTravel).toBeNull();
        expect(arrived?.assets.ownedItems).toEqual(expected);
        expect(arrived?.assets.ownedItems).not.toEqual(ownedItems);
        expect(arrived?.status.currentLifePoints).toBe(HARDY_LIFE_POINTS);
    });
});
