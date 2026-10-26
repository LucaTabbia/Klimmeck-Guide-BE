import { getQueueToken } from '@nestjs/bull';
import { INestApplication, Logger } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City } from 'src/models/city.model';
import { Pet } from 'src/models/pet.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Road } from 'src/models/road.model';
import type { RoadRoute } from 'src/roads/road-route';
import { travelSpeedFactorOf } from 'src/quests/outcomes/injuries/injury-rules';
import { RoadsService } from 'src/roads/roads.service';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { travelJobId, TRAVEL_QUEUE } from './travel-job';
import { TravelPlanner } from './travel-planner.service';
import { TravelPlanningModule } from './travel-planning.module';
import { TravelScheduler } from './travel-scheduler.service';
import { BASE_SPEED, durationMsOf } from './travel-timing';
import { FixedClock } from '../../test/auth/fixed-clock';
import {
    buildCharacter,
    persistCharacter,
    persistPet,
} from '../../test/fixtures';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';
import {
    persistTravelWorld,
    TravelWorld,
} from '../../test/travel/travel-world';

const PLANNED_AT = new Date('2026-10-21T10:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const MINUTE_MS = 60_000;
const QUEUE_TIMEOUT_MS = 50;
const ONE_LEG = ['brokenLeftLeg'];
const NO_LEGS = ['missingLeftLeg', 'missingRightLeg'];

describe('TravelPlanner and TravelScheduler (replSet)', () => {
    let app: INestApplication;
    let planner: TravelPlanner;
    let scheduler: TravelScheduler;
    let roads: RoadsService;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let pets: Model<any>;
    let pois: Model<any>;
    let cities: Model<any>;
    let roadModel: Model<any>;
    let world: TravelWorld;
    let route: RoadRoute;
    let expected: number;
    let seq = 0;
    const queue = new FakeTravelQueue();
    const questQueue = new FakeTravelQueue();

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'travel-planning-test',
                }),
                TravelPlanningModule,
            ],
        })
            .overrideProvider(getQueueToken(TRAVEL_QUEUE))
            .useValue(queue)
            .overrideProvider(getQueueToken(QUEST_RESOLUTION_QUEUE))
            .useValue(questQueue)
            .overrideProvider(Clock)
            .useValue(new FixedClock(PLANNED_AT))
            .overrideProvider(QUEUE_CALL_TIMEOUT)
            .useValue(QUEUE_TIMEOUT_MS)
            .compile();
        app = moduleRef.createNestApplication();
        await app.init();
        planner = app.get(TravelPlanner);
        scheduler = app.get(TravelScheduler);
        roads = app.get(RoadsService);
        connection = app.get<Connection>(getConnectionToken());
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        pets = app.get<Model<any>>(getModelToken(Pet.name));
        pois = app.get<Model<any>>(getModelToken(PointOfInterest.name));
        cities = app.get<Model<any>>(getModelToken(City.name));
        roadModel = app.get<Model<any>>(getModelToken(Road.name));
    });

    beforeEach(async () => {
        await Promise.all([
            characters.deleteMany({}),
            pets.deleteMany({}),
            pois.deleteMany({}),
            cities.deleteMany({}),
            roadModel.deleteMany({}),
        ]);
        world = await persistTravelWorld(connection, roads);
        queue.reset();
        questQueue.reset();
        route = roads.routeBetween([0, 0], [0, 0.2]) as RoadRoute;
        expected = durationMsOf(route.baseHours, BASE_SPEED);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    async function characterAt(
        location: Types.ObjectId,
        overrides: Record<string, any> = {},
    ): Promise<Types.ObjectId> {
        seq += 1;
        const base = buildCharacter();
        const character = await persistCharacter(characters, {
            infos: { ...base.infos, name: `Viaggiatore ${seq}` },
            ...overrides,
            status: { ...base.status, location, ...overrides.status },
            quests: { ...base.quests, ...overrides.quests },
            assets: { ...base.assets, ...overrides.assets },
        });
        return character._id as Types.ObjectId;
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function warnSpy() {
        return jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    }

    describe('planFree', () => {
        it('plans a free travel between two cities', async () => {
            const id = await characterAt(world.markerA);
            const before = await rawCharacter(id);

            const plan = await planner.planFree(id, world.markerB);

            expect(plan.location).toEqual(world.markerA);
            expect(plan.travel.kind).toBe('free');
            expect(plan.travel.to).toEqual(world.markerB);
            expect(plan.travel.road.coordinates).toEqual(route.coordinates);
            expect(plan.travel.road.distance).toBe(route.distanceKm);
            expect(plan.travel.startTime).toEqual(PLANNED_AT);
            expect(plan.travel.duration).toBe(expected);
            expect(plan.travel.endTime.getTime()).toBe(
                PLANNED_AT.getTime() + expected,
            );
            expect(await rawCharacter(id)).toEqual(before);
        });

        it('plans from a quest point of interest to any city', async () => {
            const id = await characterAt(world.questPoi);

            const plan = await planner.planFree(id, world.markerB);

            expect(plan.location).toEqual(world.questPoi);
            expect(plan.travel.to).toEqual(world.markerB);
        });

        it('halves the duration with a speedModifier 2 mount', async () => {
            const pet = await persistPet(pets, { speedModifier: 2 });
            const id = await characterAt(world.markerA, {
                assets: { pet: pet._id },
            });

            const plan = await planner.planFree(id, world.markerB);

            expect(plan.travel.duration).toBe(
                durationMsOf(route.baseHours, 20),
            );
        });

        it.each([0, -1])(
            'falls back to the base speed and warns for a speedModifier of %p',
            async (speedModifier) => {
                const warn = warnSpy();
                const pet = await persistPet(pets, { speedModifier });
                const petId = pet._id as Types.ObjectId;
                const id = await characterAt(world.markerA, {
                    assets: { pet: petId },
                });

                const plan = await planner.planFree(id, world.markerB);

                expect(plan.travel.duration).toBe(expected);
                expect(warn).toHaveBeenCalledTimes(1);
                expect(warn).toHaveBeenCalledWith(
                    `Pet ${petId.toHexString()} con speedModifier non valido: velocità base`,
                );
            },
        );

        it('uses the base speed when the mount document is missing', async () => {
            const warn = warnSpy();
            const id = await characterAt(world.markerA, {
                assets: { pet: new Types.ObjectId() },
            });

            const plan = await planner.planFree(id, world.markerB);

            expect(plan.travel.duration).toBe(expected);
            expect(warn).not.toHaveBeenCalled();
        });

        it('slows an injured traveller by the injury speed factor (D-15)', async () => {
            const id = await characterAt(world.markerA, {
                status: { injuries: ONE_LEG },
            });

            const plan = await planner.planFree(id, world.markerB);

            expect(travelSpeedFactorOf(ONE_LEG)).toBe(0.8);
            expect(plan.travel.duration).toBe(
                durationMsOf(route.baseHours, BASE_SPEED * 0.8),
            );
            expect(plan.travel.duration).toBeGreaterThan(expected);
            expect(plan.travel.endTime.getTime()).toBe(
                PLANNED_AT.getTime() + plan.travel.duration,
            );
        });

        it('multiplies the mount speed by the injury factor', async () => {
            const pet = await persistPet(pets, { speedModifier: 2 });
            const id = await characterAt(world.markerA, {
                status: { injuries: ONE_LEG },
                assets: { pet: pet._id },
            });

            const plan = await planner.planFree(id, world.markerB);

            expect(plan.travel.duration).toBe(
                durationMsOf(route.baseHours, 20 * 0.8),
            );
        });

        it('rejects a character awaiting aid with AWAITING_AID before the running travel', async () => {
            const id = await characterAt(world.markerA, {
                status: {
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: PLANNED_AT,
                    },
                },
                quests: { pendingQuest: new Types.ObjectId() },
            });
            const before = await rawCharacter(id);

            await expect(
                planner.planFree(id, world.markerB),
            ).rejects.toMatchObject({ code: 'AWAITING_AID' });
            expect(await rawCharacter(id)).toEqual(before);
        });

        it('rejects a destination that is not a city marker', async () => {
            const id = await characterAt(world.markerA);

            await expect(
                planner.planFree(id, world.questPoi),
            ).rejects.toMatchObject({ code: 'TRAVEL_DESTINATION_NOT_ALLOWED' });
        });

        it('rejects a character already travelling', async () => {
            const id = await characterAt(world.markerA, {
                status: {
                    activeTravel: {
                        road: {
                            coordinates: [
                                [0, 0],
                                [0, 0.2],
                            ],
                            distance: 1,
                        },
                        startTime: PLANNED_AT,
                        endTime: new Date(PLANNED_AT.getTime() + MINUTE_MS),
                        duration: MINUTE_MS,
                        to: world.markerB,
                        kind: 'free',
                    },
                },
            });

            await expect(
                planner.planFree(id, world.markerB),
            ).rejects.toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
        });

        it('rejects a character on a standard quest', async () => {
            const id = await characterAt(world.markerA, {
                quests: { pendingQuest: new Types.ObjectId() },
            });

            await expect(
                planner.planFree(id, world.markerB),
            ).rejects.toMatchObject({ code: 'QUEST_IN_PROGRESS' });
        });

        it('rejects a travel to the current location', async () => {
            const id = await characterAt(world.markerA);

            await expect(
                planner.planFree(id, world.markerA),
            ).rejects.toMatchObject({ code: 'TRAVEL_SAME_LOCATION' });
        });

        it('rejects a city no road reaches', async () => {
            const id = await characterAt(world.markerA);

            await expect(
                planner.planFree(id, world.markerC),
            ).rejects.toMatchObject({ code: 'TRAVEL_NO_PATH' });
        });

        it('rejects an unknown point of interest', async () => {
            const id = await characterAt(world.markerA);

            await expect(
                planner.planFree(id, new Types.ObjectId()),
            ).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: 'Luogo non trovato',
            });
        });

        it.each([
            ['archived', true],
            ['missing', false],
        ])('rejects a %s character', async (_label, archived) => {
            const id = archived
                ? await characterAt(world.markerA, { deletedAt: ARCHIVED_AT })
                : new Types.ObjectId();

            await expect(
                planner.planFree(id, world.markerB),
            ).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: 'Personaggio non trovato',
            });
        });

        it('does not block a free travel for an active story or world mission', async () => {
            const id = await characterAt(world.markerA, {
                quests: {
                    activeStoryQuest: new Types.ObjectId(),
                    activeWorldMissionQuest: new Types.ObjectId(),
                },
            });

            const plan = await planner.planFree(id, world.markerB);

            expect(plan.travel.to).toEqual(world.markerB);
        });
    });

    describe('planAuto', () => {
        it('plans the automatic travel to a quest marker', async () => {
            const travel = await planner.planAuto({
                questId: new Types.ObjectId(),
                characterId: new Types.ObjectId(),
                from: world.markerA,
                to: world.questPoi,
                pet: null,
            });

            const questRoute = roads.routeBetween(
                [0, 0],
                [0.1, 0],
            ) as RoadRoute;
            expect(travel?.kind).toBe('quest');
            expect(travel?.to).toEqual(world.questPoi);
            expect(travel?.duration).toBe(
                durationMsOf(questRoute.baseHours, BASE_SPEED),
            );
            expect(travel?.startTime).toEqual(PLANNED_AT);
        });

        it('slows the automatic travel by the injuries of the request (D-15)', async () => {
            const travel = await planner.planAuto({
                questId: new Types.ObjectId(),
                characterId: new Types.ObjectId(),
                from: world.markerA,
                to: world.questPoi,
                pet: null,
                injuries: NO_LEGS,
            });

            const questRoute = roads.routeBetween(
                [0, 0],
                [0.1, 0],
            ) as RoadRoute;
            expect(travelSpeedFactorOf(NO_LEGS)).toBeCloseTo(0.64);
            expect(travel?.duration).toBe(
                durationMsOf(
                    questRoute.baseHours,
                    BASE_SPEED * travelSpeedFactorOf(NO_LEGS),
                ),
            );
            expect(travel?.duration).toBeGreaterThan(
                durationMsOf(questRoute.baseHours, BASE_SPEED),
            );
        });

        it('answers null and warns when no road reaches the marker', async () => {
            const warn = warnSpy();
            const questId = new Types.ObjectId();
            const characterId = new Types.ObjectId();

            const travel = await planner.planAuto({
                questId,
                characterId,
                from: world.markerA,
                to: world.farQuestPoi,
                pet: null,
            });

            expect(travel).toBeNull();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Nessuna strada dal luogo ${world.markerA.toHexString()} al marker ${world.farQuestPoi.toHexString()} della missione ${questId.toHexString()} per il personaggio ${characterId.toHexString()}: salto istantaneo`,
            );
        });

        // marker senza documento POI = difetto di catalogo (D-27): rifiuto fail-closed, mai un salto su un luogo inesistente
        it('rejects a marker without a point of interest document with QUEST_NOT_ACCEPTABLE', async () => {
            const warn = warnSpy();
            const questId = new Types.ObjectId();
            const characterId = new Types.ObjectId();
            const ghost = new Types.ObjectId();

            await expect(
                planner.planAuto({
                    questId,
                    characterId,
                    from: world.markerA,
                    to: ghost,
                    pet: null,
                }),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_ACCEPTABLE' });

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Marker ${ghost.toHexString()} della missione ${questId.toHexString()} inesistente: accettazione rifiutata`,
            );
            expect(warn.mock.calls[0][0] as string).not.toContain(
                characterId.toHexString(),
            );
        });

        // la partenza pendente è benigna: il salto ripara la posizione (D-03)
        it('still jumps when only the starting location is missing', async () => {
            const warn = warnSpy();

            const travel = await planner.planAuto({
                questId: new Types.ObjectId(),
                characterId: new Types.ObjectId(),
                from: new Types.ObjectId(),
                to: world.questPoi,
                pet: null,
            });

            expect(travel).toBeNull();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0] as string).toContain(
                'salto istantaneo',
            );
        });
    });

    describe('TravelScheduler', () => {
        const characterId = new Types.ObjectId();
        const travel = {
            startTime: PLANNED_AT,
            endTime: new Date(PLANNED_AT.getTime() + 5 * MINUTE_MS),
        };
        const jobId = travelJobId(characterId, travel.startTime);

        it('enqueues the completion job with a deterministic id and delay', async () => {
            await scheduler.schedule(characterId, travel);

            expect(queue.add).toHaveBeenCalledTimes(1);
            expect(queue.add).toHaveBeenCalledWith(
                'complete',
                {
                    characterId: characterId.toHexString(),
                    startTime: travel.startTime.getTime(),
                    endTime: travel.endTime.getTime(),
                },
                {
                    jobId,
                    delay: travel.endTime.getTime() - PLANNED_AT.getTime(),
                    removeOnComplete: true,
                    removeOnFail: false,
                },
            );
        });

        it('uses a zero delay for an overdue travel', async () => {
            await scheduler.schedule(characterId, {
                startTime: new Date(PLANNED_AT.getTime() - 2 * MINUTE_MS),
                endTime: new Date(PLANNED_AT.getTime() - MINUTE_MS),
            });

            expect(queue.added[0].options).toMatchObject({ delay: 0 });
        });

        it('never throws when the queue is unavailable', async () => {
            const warn = warnSpy();
            queue.failAdd = true;

            await expect(
                scheduler.schedule(characterId, travel),
            ).resolves.toBeUndefined();
            expect(warn).toHaveBeenCalledWith(
                `Accodamento del viaggio ${jobId} fallito: lo completerà lo sweep`,
            );
        });

        it('removes the pending job on cancel', async () => {
            await scheduler.schedule(characterId, travel);

            await scheduler.cancel(characterId, travel.startTime);

            expect(queue.getJob).toHaveBeenCalledWith(jobId);
            expect(queue.removed).toEqual([jobId]);
        });

        it('tolerates a missing or locked job on cancel', async () => {
            const warn = warnSpy();
            await expect(
                scheduler.cancel(characterId, travel.startTime),
            ).resolves.toBeUndefined();
            expect(warn).not.toHaveBeenCalled();

            await scheduler.schedule(characterId, travel);
            queue.failRemove = true;

            await expect(
                scheduler.cancel(characterId, travel.startTime),
            ).resolves.toBeUndefined();
            expect(queue.removed).toEqual([]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Rimozione del job ${jobId} non riuscita: il job si neutralizza da solo`,
            );
        });

        it('answers within the timeout when the enqueue hangs', async () => {
            queue.hangAdd = true;
            const warn = warnSpy();

            await expect(
                scheduler.schedule(characterId, travel),
            ).resolves.toBeUndefined();
            expect(queue.add).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Accodamento del viaggio ${jobId} non confermato entro ${QUEUE_TIMEOUT_MS} ms: lo completerà lo sweep`,
            );
        });

        it('answers within the timeout when the job removal hangs', async () => {
            await scheduler.schedule(characterId, travel);
            queue.hangRemove = true;
            const warn = warnSpy();

            await expect(
                scheduler.cancel(characterId, travel.startTime),
            ).resolves.toBeUndefined();
            expect(queue.removed).toEqual([]);
            expect(warn).toHaveBeenCalledWith(
                `Rimozione del job ${jobId} non confermata entro ${QUEUE_TIMEOUT_MS} ms: il job si neutralizza da solo`,
            );
        });

        it('warns once on a Redis connection error without connection details', () => {
            const warn = warnSpy();

            queue.emit(
                'error',
                Object.assign(
                    new Error('connect ECONNREFUSED 127.0.0.1:6379'),
                    { code: 'ECONNREFUSED' },
                ),
            );
            queue.emit('error', new Error('Connection is closed.'));

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                'Redis non raggiungibile (ECONNREFUSED): i job di viaggio partiranno al riconnesso, lo sweep copre',
            );
            expect(String(warn.mock.calls[0][0])).not.toMatch(
                /127\.0\.0\.1|6379/,
            );
        });
    });
});
