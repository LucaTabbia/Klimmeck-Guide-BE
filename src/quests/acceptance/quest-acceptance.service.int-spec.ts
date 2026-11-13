import { FAILED_JOBS_KEPT } from 'src/queues/enqueue-trigger';
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
import { City, CityDocument } from 'src/models/city.model';
import { LootItem } from 'src/models/loot-item.model';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import {
    hasSeatFor,
    RankSlot,
    RegisteredAdventurer,
    seatAvailableExpr,
    slotRuleOf,
} from 'src/quests/acceptance/quest-capacity';
import type { RoadRoute } from 'src/roads/road-route';
import { RoadsService } from 'src/roads/roads.service';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { QuestStartService } from 'src/quests/party/quest-start.service';
import { TravelPantryReader } from 'src/travel/food/travel-pantry.reader';
import {
    foodNeededFor,
    hpLostFor,
    uncoveredKmOf,
} from 'src/travel/food/travel-food';
import { AMBUSH_JOB, ambushJobId } from 'src/travel/ambush/ambush-job';
import { TRAVEL_QUEUE, travelJobId } from 'src/travel/travel-job';
import { BASE_SPEED, durationMsOf } from 'src/travel/travel-timing';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistCity,
    persistLootItem,
    persistPoi,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    AmbushWorld,
    persistAmbushWorld,
} from '../../../test/travel/ambush-world';
import { persistGeographyLore } from '../../../test/lore/lore-world';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    foodStack,
    HARDY_LIFE_POINTS,
    persistFood,
} from '../../../test/travel/travel-food.fixture';
import {
    persistTravelWorld,
    TravelWorld,
} from '../../../test/travel/travel-world';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const ACCEPTED_AT = new Date('2026-03-04T05:06:07.000Z');
const STARTING_COINS = { gold: 1, silver: 2, copper: 3 };
// collection della mappa del viaggio: pre-create per le transazioni e svuotate dopo ogni test
const TRAVEL_COLLECTIONS = ['lootitems', 'pets', 'pointsofinterest', 'roads'];
// dispensa a grana fine: le unità mangiate sono il fabbisogno esatto
const LARDER = 500;

// liste scritte con il driver nei test, senza il cast di Mongoose
interface RawQuestRegistrations {
    registeredAdventurers: { character: Types.ObjectId; title: string }[];
}

interface RawCityPointsOfInterest {
    pointsOfInterest: Types.ObjectId[];
}

interface World {
    cityMarker: Types.ObjectId;
    cityPoi: Types.ObjectId;
    questMarker: Types.ObjectId;
}

describe('QuestAcceptanceService (replSet)', () => {
    let app: INestApplication;
    let acceptance: QuestAcceptanceService;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let users: Model<UserDocument>;
    let cities: Model<CityDocument>;
    let pois: Model<any>;
    let world: World;
    let seq = 0;
    const queue = new FakeTravelQueue();

    function rawQuests() {
        return connection.collection<RawQuestRegistrations>(
            quests.collection.collectionName,
        );
    }

    function rawCities() {
        return connection.collection<RawCityPointsOfInterest>(
            cities.collection.collectionName,
        );
    }
    const questQueue = new FakeTravelQueue();

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'quest-acceptance-test',
                }),
                QuestAcceptanceModule,
            ],
        })
            .overrideProvider(getQueueToken(TRAVEL_QUEUE))
            .useValue(queue)
            .overrideProvider(getQueueToken(QUEST_RESOLUTION_QUEUE))
            .useValue(questQueue)
            .overrideProvider(Clock)
            .useValue(new FixedClock(ACCEPTED_AT))
            .compile();
        app = moduleRef.createNestApplication();
        await app.init();
        acceptance = app.get(QuestAcceptanceService);
        connection = app.get<Connection>(getConnectionToken());
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        quests = app.get<Model<QuestDocument>>(getModelToken(Quest.name));
        pendingQuests = app.get<Model<PendingQuestDocument>>(
            getModelToken(PendingQuest.name),
        );
        users = app.get<Model<UserDocument>>(getModelToken(User.name));
        cities = app.get<Model<CityDocument>>(getModelToken(City.name));
        pois = app.get<Model<any>>(getModelToken(PointOfInterest.name));
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            quests.init(),
            pendingQuests.init(),
            users.init(),
            cities.init(),
            ...TRAVEL_COLLECTIONS.map((name) =>
                connection.createCollection(name).catch(() => undefined),
            ),
        ]);
    });

    beforeEach(async () => {
        world = await persistWorld();
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        queue.reset();
        questQueue.reset();
        await Promise.all([
            ...TRAVEL_COLLECTIONS.map((name) =>
                connection.collection(name).deleteMany({}),
            ),
            characters.deleteMany({}),
            quests.deleteMany({}),
            pendingQuests.deleteMany({}),
            users.deleteMany({}),
            cities.deleteMany({}),
        ]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    // POI reali (un marker senza documento è rifiutato, D-27), lontani dalla rete del travel world: senza strada la corsia standard salta (D-03)
    async function persistWorld(): Promise<World> {
        const cityId = new Types.ObjectId();
        const poiAt = async (
            location: [number, number],
            type: string,
        ): Promise<Types.ObjectId> =>
            (await persistPoi(pois, { location, type, city: cityId }))
                ._id as Types.ObjectId;
        const cityMarker = await poiAt([50, 50], 'city');
        const cityPoi = await poiAt([50.01, 50.01], 'ruins');
        const questMarker = await poiAt([50.02, 50.02], 'dungeon');
        await persistCity(cities, {
            _id: cityId,
            markerLocation: cityMarker,
            pointsOfInterest: [cityMarker, cityPoi, questMarker],
        });
        return { cityMarker, cityPoi, questMarker };
    }

    async function ownerWith(points: number): Promise<Types.ObjectId> {
        const user = await persistUser(users, {
            twitchId: `twitch-acceptance-${seq++}`,
            twitchPoints: points,
        });
        return user._id as Types.ObjectId;
    }

    // HP robusti di default: due viaggi di fila senza cibo non affamano (Phase 14 D-18)
    async function characterAt(
        location: Types.ObjectId,
        title = 'rookie',
        questsState: Record<string, unknown> = {},
        extra: { lifePoints?: number; ownedItems?: unknown[] } = {},
    ): Promise<Types.ObjectId> {
        const base = buildCharacter();
        const lifePoints = extra.lifePoints ?? HARDY_LIFE_POINTS;
        const character = await persistCharacter(characters, {
            infos: { ...base.infos, name: `Eroe ${seq++}` },
            status: {
                ...base.status,
                location,
                title,
                coins: STARTING_COINS,
                currentLifePoints: lifePoints,
                maxLifePoints: lifePoints,
            },
            quests: {
                completedQuests: [],
                pendingQuest: null,
                ...questsState,
            },
            assets: {
                ...base.assets,
                ownedItems: extra.ownedItems ?? base.assets.ownedItems,
            },
        });
        return character._id as Types.ObjectId;
    }

    async function questOf(
        type: string,
        requirements: Record<string, unknown> = {},
        infos: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type,
                markerLocation: world.questMarker,
                ...infos,
            },
            requirements: { ...base.requirements, ...requirements },
        });
        return quest._id as Types.ObjectId;
    }

    function accept(
        ownerId: Types.ObjectId,
        characterId: Types.ObjectId,
        questId: Types.ObjectId,
    ): Promise<Types.ObjectId> {
        return acceptance.accept({ ownerId, characterId, questId });
    }

    function raw(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function pendingOf(id: Types.ObjectId) {
        return pendingQuests.collection.findOne({ _id: id });
    }

    function pendingCount(): Promise<number> {
        return pendingQuests.countDocuments();
    }

    async function pointsOf(ownerId: Types.ObjectId): Promise<number> {
        const user = await users.collection.findOne({ _id: ownerId });
        return user?.twitchPoints as number;
    }

    function codeOf(result: PromiseSettledResult<unknown>): string | undefined {
        return result.status === 'rejected'
            ? (result.reason as { code?: string }).code
            : undefined;
    }

    // scrittura diretta: bypassa la validazione Mongoose per simulare dati legacy o difettosi del catalogo
    async function insertQuest(
        type: string,
        requirements: Record<string, unknown> = {},
        registeredAdventurers: RegisteredAdventurer[] = [],
    ): Promise<Types.ObjectId> {
        const base = buildQuest();
        const _id = new Types.ObjectId();
        await quests.collection.insertOne({
            ...base,
            _id,
            infos: { ...base.infos, type, markerLocation: world.questMarker },
            requirements: { ...base.requirements, ...requirements },
            registeredAdventurers,
        });
        return _id;
    }

    function activeTravel() {
        return {
            road: {
                coordinates: [
                    [0, 0],
                    [0, 0.2],
                ],
                distance: 0.44,
            },
            startTime: ACCEPTED_AT,
            endTime: new Date(ACCEPTED_AT.getTime() + 3_600_000),
            duration: 3_600_000,
            to: new Types.ObjectId(),
            kind: 'free',
        };
    }

    function startTravel(charId: Types.ObjectId) {
        return characters.collection.updateOne(
            { _id: charId },
            { $set: { 'status.activeTravel': activeTravel() } },
        );
    }

    async function otherCityMarker(): Promise<Types.ObjectId> {
        const marker = new Types.ObjectId();
        await persistCity(cities, {
            markerLocation: marker,
            pointsOfInterest: [marker],
        });
        return marker;
    }

    // lo stato cambia fra la pre-verifica e la transazione: il rifiuto può venire solo dal filtro (IN-04)
    function interleaveBeforeTransaction(
        interlude: () => Promise<unknown>,
    ): jest.SpyInstance {
        const transaction = connection.transaction.bind(connection);
        return jest
            .spyOn(connection, 'transaction')
            .mockImplementationOnce(async (fn, options) => {
                await interlude();
                return transaction(fn, options);
            });
    }

    const ANY_THREE = [{ title: null, count: 3 }];

    describe('lanes and points', () => {
        it('claims the story lane, records the paid points and debits the owner', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf(
                'story',
                { requiredPoints: 5000, minTitle: 'rookie' },
                { timeToComplete: 60000 },
            );
            const pqId = await accept(ownerId, charId, questId);

            expect(pqId).toBeInstanceOf(Types.ObjectId);
            const character = await raw(charId);
            expect(character?.quests.activeStoryQuest).toEqual(pqId);
            expect(character?.quests.pendingQuest).toBeNull();
            expect(character?.quests.activeWorldMissionQuest).toBeNull();
            const pending = await pendingOf(pqId);
            expect(pending).toMatchObject({
                quest: questId,
                waitingTime: 0,
                pointsSpent: 5000,
            });
            expect(pending?.startDate).toEqual(ACCEPTED_AT);
            expect(pending?.arrivedAt).toEqual(ACCEPTED_AT);
            expect(await pointsOf(ownerId)).toBe(1000);
            expect(character?.status.coins).toEqual(STARTING_COINS);
        });

        it('claims the world mission lane and debits its own points', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.quests.activeWorldMissionQuest).toEqual(pqId);
            expect(character?.quests.pendingQuest).toBeNull();
            expect(await pendingOf(pqId)).toMatchObject({
                pointsSpent: 3000,
                waitingTime: 0,
            });
            expect(await pointsOf(ownerId)).toBe(3000);
            expect(character?.status.coins).toEqual(STARTING_COINS);
        });

        it('accepts a standard quest for free and ignores requiredPoints', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf(
                'hunt',
                { requiredPoints: 3000 },
                { timeToComplete: 60000 },
            );

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.quests.pendingQuest).toEqual(pqId);
            expect(await pendingOf(pqId)).toMatchObject({
                waitingTime: 60000,
                pointsSpent: 0,
            });
            expect(await pointsOf(ownerId)).toBe(6000);
            expect(character?.status.coins).toEqual(STARTING_COINS);
        });

        it('uses a zero waiting time for a standard quest without timeToComplete', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('hunt', {}, { timeToComplete: null });

            const pqId = await accept(ownerId, charId, questId);

            expect((await pendingOf(pqId))?.waitingTime).toBe(0);
        });

        it('runs a story in parallel with a pending standard quest', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const huntId = await questOf('hunt');
            const storyId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });

            const huntPq = await accept(ownerId, charId, huntId);
            const storyPq = await accept(ownerId, charId, storyId);

            const character = await raw(charId);
            expect(character?.quests.pendingQuest).toEqual(huntPq);
            expect(character?.quests.activeStoryQuest).toEqual(storyPq);
            expect(await pendingCount()).toBe(2);
        });
    });

    describe('rejections', () => {
        it('rejects a second story while one is active with QUEST_SLOT_BUSY and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const firstId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });
            const secondId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });
            const firstPq = await accept(ownerId, charId, firstId);

            await expect(
                accept(ownerId, charId, secondId),
            ).rejects.toMatchObject({ code: 'QUEST_SLOT_BUSY' });

            expect(await pendingCount()).toBe(1);
            expect(await pointsOf(ownerId)).toBe(5000);
            expect((await raw(charId))?.quests.activeStoryQuest).toEqual(
                firstPq,
            );
        });

        it('answers INSUFFICIENT_POINTS and writes nothing', async () => {
            const ownerId = await ownerWith(100);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('story', {
                requiredPoints: 5000,
                minTitle: 'rookie',
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });

            expect((await raw(charId))?.quests.activeStoryQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(100);
        });

        it.each([null, 0, -5, 1.5])(
            'rejects a story whose requiredPoints is %p with QUEST_NOT_ACCEPTABLE',
            async (requiredPoints) => {
                const warn = jest
                    .spyOn(Logger.prototype, 'warn')
                    .mockImplementation();
                const ownerId = await ownerWith(6000);
                const charId = await characterAt(world.cityMarker);
                const questId = await questOf('story', {
                    requiredPoints,
                    minTitle: 'rookie',
                });

                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({ code: 'QUEST_NOT_ACCEPTABLE' });

                expect((await raw(charId))?.quests.activeStoryQuest).toBeNull();
                expect(await pendingCount()).toBe(0);
                expect(await pointsOf(ownerId)).toBe(6000);
                expect(warn).toHaveBeenCalledTimes(1);
                expect(warn).toHaveBeenCalledWith(
                    `Missione ${questId.toHexString()} non accettabile: requiredPoints non valido per la corsia activeStoryQuest`,
                );
                const message = warn.mock.calls[0][0] as string;
                expect(message).not.toContain(ownerId.toHexString());
            },
        );

        it('rejects a world mission without requiredPoints with QUEST_NOT_ACCEPTABLE', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation();
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: null,
                requiredAdventurers: ANY_THREE,
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_ACCEPTABLE' });

            expect(
                (await raw(charId))?.quests.activeWorldMissionQuest,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Missione ${questId.toHexString()} non accettabile: requiredPoints non valido per la corsia activeWorldMissionQuest`,
            );
            const message = warn.mock.calls[0][0] as string;
            expect(message).not.toContain(ownerId.toHexString());
        });

        it('answers NOT_FOUND for an unknown quest', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);

            await expect(
                accept(ownerId, charId, new Types.ObjectId()),
            ).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: 'Missione non trovata',
            });

            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
        });

        it('answers NOT_FOUND for a missing character', async () => {
            const ownerId = await ownerWith(6000);
            const questId = await questOf('hunt');

            await expect(
                accept(ownerId, new Types.ObjectId(), questId),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });

            expect(await pendingCount()).toBe(0);
        });

        it('answers NOT_FOUND for an archived character', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            await characters.collection.updateOne(
                { _id: charId },
                {
                    $set: {
                        deletedAt: ARCHIVED_AT,
                        deletionReason: 'user_request',
                    },
                },
            );
            const questId = await questOf('hunt');

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });

            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
        });

        it('answers NOT_FOUND for an unknown owner', async () => {
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });

            await expect(
                accept(new Types.ObjectId(), charId, questId),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });

            expect((await raw(charId))?.quests.activeStoryQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
        });
    });

    describe('a heal without effect (D-25)', () => {
        const VILLAGE_CURE = { lifePointsShare: 0.5, canHeal: ['deepCut'] };

        async function curingQuestOf(
            type: string,
            prizes: Record<string, unknown> = { cure: VILLAGE_CURE },
        ): Promise<Types.ObjectId> {
            const base = buildQuest();
            const quest = await persistQuest(quests, {
                infos: {
                    ...base.infos,
                    type,
                    markerLocation: world.questMarker,
                },
                prizes: { ...base.prizes, ...prizes },
            });
            return quest._id as Types.ObjectId;
        }

        async function woundedAt(
            hp: number,
            injuries: string[],
            questsState: Record<string, unknown> = {},
        ): Promise<Types.ObjectId> {
            const charId = await characterAt(
                world.cityMarker,
                'rookie',
                questsState,
            );
            await characters.collection.updateOne(
                { _id: charId },
                {
                    $set: {
                        'status.currentLifePoints': hp,
                        'status.maxLifePoints': 1000,
                        'status.injuries': injuries,
                    },
                },
            );
            return charId;
        }

        async function everything() {
            const [rawCharacters, rawQuestDocs, rawPending, rawUsers] =
                await Promise.all([
                    characters.collection.find().toArray(),
                    quests.collection.find().toArray(),
                    pendingQuests.collection.find().toArray(),
                    users.collection.find().toArray(),
                ]);
            return {
                characters: rawCharacters,
                quests: rawQuestDocs,
                pendingQuests: rawPending,
                users: rawUsers,
                travelJobs: [...queue.added],
                questJobs: [...questQueue.added],
            };
        }

        async function expectRefusedWithoutWrites(
            charId: Types.ObjectId,
            questId: Types.ObjectId,
        ): Promise<void> {
            const ownerId = await ownerWith(6000);
            const before = await everything();

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({
                extensions: { code: 'QUEST_NO_EFFECT' },
            });

            expect(await everything()).toEqual(before);
            expect(before.travelJobs).toEqual([]);
            expect(before.questJobs).toEqual([]);
        }

        async function expectAccepted(
            charId: Types.ObjectId,
            questId: Types.ObjectId,
        ): Promise<void> {
            const pqId = await accept(await ownerWith(0), charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
        }

        it('refuses a heal without effect with QUEST_NO_EFFECT and writes nothing (D-25)', async () => {
            await expectRefusedWithoutWrites(
                await woundedAt(500, []),
                await curingQuestOf('heal'),
            );
        });

        it('refuses a heal without a cure for anyone (D-25)', async () => {
            await expectRefusedWithoutWrites(
                await woundedAt(1, ['deepCut', 'infection']),
                await curingQuestOf('heal', {}),
            );
        });

        it('accepts a heal that would cure an injury at full life points (D-25)', async () => {
            await expectAccepted(
                await woundedAt(1000, ['deepCut']),
                await curingQuestOf('heal'),
            );
        });

        it('accepts a heal below the ceiling without curable injuries (D-25)', async () => {
            await expectAccepted(
                await woundedAt(400, ['infection']),
                await curingQuestOf('heal'),
            );
        });

        it('accepts a job that carries a cure even when it would cure nothing (D-25)', async () => {
            await expectAccepted(
                await woundedAt(1000, []),
                await curingQuestOf('job'),
            );
        });

        it('answers the eligibility refusals before the heal without effect (D-25)', async () => {
            const charId = await woundedAt(1000, [], {
                pendingQuest: new Types.ObjectId(),
            });

            await expect(
                accept(await ownerWith(0), charId, await curingQuestOf('heal')),
            ).rejects.toMatchObject({ code: 'QUEST_SLOT_BUSY' });
        });
    });

    describe('concurrency (SC2/SC3)', () => {
        it('rejects with QUEST_SLOT_BUSY when the lane is taken after the pre-check, writing nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('story', {
                requiredPoints: 5000,
                minTitle: 'rookie',
            });
            const rivalLane = new Types.ObjectId();
            const transaction = interleaveBeforeTransaction(() =>
                characters.collection.updateOne(
                    { _id: charId },
                    { $set: { 'quests.activeStoryQuest': rivalLane } },
                ),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_SLOT_BUSY' });

            expect(transaction).toHaveBeenCalledTimes(1);
            expect((await raw(charId))?.quests.activeStoryQuest).toEqual(
                rivalLane,
            );
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('rejects with QUEST_FULL when the rank fills after the pre-check, writing nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'hero');
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: [{ title: 'hero', count: 1 }],
            });
            const rival = new Types.ObjectId();
            const transaction = interleaveBeforeTransaction(() =>
                rawQuests().updateOne(
                    { _id: questId },
                    {
                        $push: {
                            registeredAdventurers: {
                                character: rival,
                                title: 'hero',
                            },
                        },
                    },
                ),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_FULL' });

            expect(transaction).toHaveBeenCalledTimes(1);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                { character: rival, title: 'hero' },
            ]);
            expect(
                (await raw(charId))?.quests.activeWorldMissionQuest,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('lets exactly one of three concurrent story accepts win', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('story', {
                requiredPoints: 5000,
                minTitle: 'rookie',
            });

            const results = await Promise.allSettled([
                accept(ownerId, charId, questId),
                accept(ownerId, charId, questId),
                accept(ownerId, charId, questId),
            ]);

            const fulfilled = results.filter(
                (r): r is PromiseFulfilledResult<Types.ObjectId> =>
                    r.status === 'fulfilled',
            );
            const rejected = results.filter((r) => r.status === 'rejected');
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(2);
            for (const loser of rejected) {
                expect(codeOf(loser)).toBe('QUEST_SLOT_BUSY');
            }
            expect(await pendingCount()).toBe(1);
            expect(await pointsOf(ownerId)).toBe(1000);
            expect((await raw(charId))?.quests.activeStoryQuest).toEqual(
                fulfilled[0].value,
            );
        });
    });

    function rawQuest(id: Types.ObjectId) {
        return quests.collection.findOne({ _id: id });
    }

    async function heroesRacing(
        count: number,
        title: string,
    ): Promise<{ owners: Types.ObjectId[]; chars: Types.ObjectId[] }> {
        const owners: Types.ObjectId[] = [];
        const chars: Types.ObjectId[] = [];
        for (let i = 0; i < count; i++) {
            owners.push(await ownerWith(6000));
            chars.push(await characterAt(world.cityMarker, title));
        }
        return { owners, chars };
    }

    describe('eligibility', () => {
        it('rejects an already completed story with QUEST_ALREADY_TAKEN and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });
            const charId = await characterAt(world.cityMarker, 'rookie', {
                completedQuests: [questId],
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });

            expect((await raw(charId))?.quests.activeStoryQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('rejects a story completed under a legacy hex id with QUEST_ALREADY_TAKEN', async () => {
            const ownerId = await ownerWith(6000);
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });
            const charId = await characterAt(world.cityMarker);
            await characters.collection.updateOne(
                { _id: charId },
                { $set: { 'quests.completedQuests': [questId.toHexString()] } },
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });

            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('accepts a completed hunt again', async () => {
            const ownerId = await ownerWith(0);
            const questId = await questOf('hunt');
            const charId = await characterAt(world.cityMarker, 'rookie', {
                completedQuests: [questId],
            });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
        });

        it('rejects a world mission the character already joined with QUEST_ALREADY_TAKEN', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });
            await accept(ownerId, charId, questId);

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });

            expect(await pendingCount()).toBe(1);
            expect(await pointsOf(ownerId)).toBe(3000);
        });

        it.each([
            ['adventurer', 'rookie'],
            ['rookie', 'adventurer'],
        ])(
            'rejects a story for minTitle %s and title %s with QUEST_TITLE_MISMATCH',
            async (minTitle, title) => {
                const ownerId = await ownerWith(6000);
                const charId = await characterAt(world.cityMarker, title);
                const questId = await questOf('story', {
                    requiredPoints: 1000,
                    minTitle,
                });

                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({ code: 'QUEST_TITLE_MISMATCH' });

                expect((await raw(charId))?.quests.activeStoryQuest).toBeNull();
                expect(await pendingCount()).toBe(0);
                expect(await pointsOf(ownerId)).toBe(6000);
            },
        );

        it('accepts a hunt for a hero when minTitle is paladin', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(world.cityMarker, 'hero');
            const questId = await questOf('hunt', { minTitle: 'paladin' });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
        });

        it('rejects a magic quest for a paladin when minTitle is mage with QUEST_TITLE_MISMATCH (quick 261110-mag)', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'paladin');
            const questId = await questOf('magic', { minTitle: 'mage' });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_TITLE_MISMATCH' });

            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it.each(['mage', 'hero'])(
            'accepts a magic quest for a %s when minTitle is mage, at no cost (quick 261110-mag)',
            async (title) => {
                const ownerId = await ownerWith(6000);
                const charId = await characterAt(world.cityMarker, title);
                const questId = await questOf('magic', { minTitle: 'mage' });

                const pqId = await accept(ownerId, charId, questId);

                expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
                expect(await pointsOf(ownerId)).toBe(6000);
            },
        );
    });

    describe('travel guard (D-06)', () => {
        it('rejects a travelling character with TRAVEL_IN_PROGRESS and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            await startTravel(charId);
            const huntId = await questOf('hunt');
            const storyId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });

            await expect(accept(ownerId, charId, huntId)).rejects.toMatchObject(
                { code: 'TRAVEL_IN_PROGRESS' },
            );
            await expect(
                accept(ownerId, charId, storyId),
            ).rejects.toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });

            const character = await raw(charId);
            expect(character?.quests.pendingQuest).toBeNull();
            expect(character?.quests.activeStoryQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('rejects with TRAVEL_IN_PROGRESS when the travel starts after the pre-check', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('hunt');
            const transaction = interleaveBeforeTransaction(() =>
                startTravel(charId),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });

            expect(transaction).toHaveBeenCalledTimes(1);
            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });
    });

    function awaitAid(charId: Types.ObjectId) {
        return characters.collection.updateOne(
            { _id: charId },
            {
                $set: {
                    'status.awaitingAid': {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: ACCEPTED_AT,
                    },
                },
            },
        );
    }

    function conclude(questId: Types.ObjectId) {
        return quests.collection.updateOne(
            { _id: questId },
            { $set: { concludedAt: ACCEPTED_AT } },
        );
    }

    function imprison(characterId: Types.ObjectId, until: Date) {
        return characters.collection.updateOne(
            { _id: characterId },
            { $set: { 'status.imprisonedUntil': until } },
        );
    }

    describe('prison guard (quick 261110-cgd)', () => {
        const RELEASE = new Date(ACCEPTED_AT.getTime() + 60_000);

        it('rejects every lane of an imprisoned character with CHARACTER_IMPRISONED and writes nothing (quick 261110-cgd)', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            await imprison(charId, RELEASE);
            const questIds = [
                await questOf('crime'),
                await questOf('story', {
                    requiredPoints: 1000,
                    minTitle: 'rookie',
                }),
                await questOf('worldMission', {
                    requiredPoints: 3000,
                    requiredAdventurers: ANY_THREE,
                }),
                await questOf('aid', { requiredAdventurers: ANY_THREE }),
            ];
            const before = await raw(charId);

            for (const questId of questIds)
                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({
                    code: 'CHARACTER_IMPRISONED',
                    extensions: {
                        code: 'CHARACTER_IMPRISONED',
                        imprisonedUntil: RELEASE.toISOString(),
                    },
                });

            expect(await raw(charId)).toEqual(before);
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            for (const questId of questIds)
                expect(
                    (await rawQuest(questId))?.registeredAdventurers,
                ).toEqual([]);
            expect(queue.added).toEqual([]);
        });

        it('rejects with CHARACTER_IMPRISONED when the prison starts after the pre-check (quick 261110-cgd)', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });
            const transaction = interleaveBeforeTransaction(() =>
                imprison(charId, RELEASE),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'CHARACTER_IMPRISONED' });

            expect(transaction).toHaveBeenCalledTimes(1);
            const character = await raw(charId);
            expect(
                character?.quests.activeWorldMissionQuest ?? null,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('accepts a quest once the prison has ended (quick 261110-cgd)', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            await imprison(charId, ACCEPTED_AT);
            const questId = await questOf('crime');

            await expect(
                accept(ownerId, charId, questId),
            ).resolves.toBeInstanceOf(Types.ObjectId);
            expect(await pendingCount()).toBe(1);
        });
    });

    describe('aid wait guard (D-07)', () => {
        it('rejects every lane of a character awaiting aid with AWAITING_AID and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            await awaitAid(charId);
            const questIds = [
                await questOf('hunt'),
                await questOf('story', {
                    requiredPoints: 1000,
                    minTitle: 'rookie',
                }),
                await questOf('worldMission', {
                    requiredPoints: 3000,
                    requiredAdventurers: ANY_THREE,
                }),
                await questOf('aid', { requiredAdventurers: ANY_THREE }),
            ];
            const before = await raw(charId);

            for (const questId of questIds)
                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({
                    code: 'AWAITING_AID',
                    message: 'Il tuo personaggio è in attesa di soccorso',
                });

            expect(await raw(charId)).toEqual(before);
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            for (const questId of questIds)
                expect(
                    (await rawQuest(questId))?.registeredAdventurers,
                ).toEqual([]);
            expect(queue.added).toEqual([]);
        });

        it('rejects with AWAITING_AID when the aid wait starts after the pre-check', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });
            const transaction = interleaveBeforeTransaction(() =>
                awaitAid(charId),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'AWAITING_AID' });

            expect(transaction).toHaveBeenCalledTimes(1);
            const character = await raw(charId);
            expect(
                character?.quests.activeWorldMissionQuest ?? null,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
        });
    });

    describe('concluded quests (D-06, C9)', () => {
        it('answers NOT_FOUND for a concluded quest and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('aid', {
                requiredAdventurers: ANY_THREE,
            });
            await conclude(questId);
            const before = await raw(charId);

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: 'Missione non trovata',
            });

            expect(await raw(charId)).toEqual(before);
            expect(await pendingCount()).toBe(0);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
        });

        it('answers NOT_FOUND when the quest concludes after the pre-check, writing nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });
            const transaction = interleaveBeforeTransaction(() =>
                conclude(questId),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: 'Missione non trovata',
            });

            expect(transaction).toHaveBeenCalledTimes(1);
            const character = await raw(charId);
            expect(
                character?.quests.activeWorldMissionQuest ?? null,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
        });
    });

    describe('automatic travel to the quest marker (D-02, D-03, D-21)', () => {
        let travel: TravelWorld;

        beforeEach(async () => {
            travel = await persistTravelWorld(
                connection,
                app.get(RoadsService),
            );
        });

        function huntTo(
            marker: Types.ObjectId,
            requirements: Record<string, unknown> = {},
            type = 'hunt',
        ): Promise<Types.ObjectId> {
            return questOf(type, requirements, {
                markerLocation: marker,
                timeToComplete: 60000,
            });
        }

        it('starts the travel to the marker in the same claim', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.markerA);
            const questId = await huntTo(travel.questPoi);

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.quests.pendingQuest).toEqual(pqId);
            const active = character?.status.activeTravel;
            expect(active).toMatchObject({
                kind: 'quest',
                to: travel.questPoi,
                startTime: ACCEPTED_AT,
            });
            expect(active.road.coordinates[0]).toEqual([0, 0]);
            expect(active.road.coordinates.at(-1)).toEqual([0.1, 0]);
            expect(active.endTime.getTime() - active.startTime.getTime()).toBe(
                active.duration,
            );
            expect(character?.status.location).toEqual(travel.markerA);
            const pending = await pendingOf(pqId);
            expect(pending?.startDate).toBeNull();
            expect(pending?.arrivedAt).toBeNull();
            expect(pending?.waitingTime).toBe(60000);
            expect(queue.added).toHaveLength(1);
            expect(queue.added[0].options).toMatchObject({
                jobId: travelJobId(charId, ACCEPTED_AT),
                delay: active.duration,
            });
        });

        // velocità fotografata alla partenza: le ferite valgono anche sul viaggio automatico (D-15)
        it('slows the automatic travel of an injured character', async () => {
            const ownerId = await ownerWith(0);
            const healthyId = await characterAt(travel.markerA);
            const injuredId = await characterAt(travel.markerA);
            await characters.collection.updateOne(
                { _id: injuredId },
                { $set: { 'status.injuries': ['brokenLeftLeg'] } },
            );

            await accept(ownerId, healthyId, await huntTo(travel.questPoi));
            await accept(ownerId, injuredId, await huntTo(travel.questPoi));

            const route = app
                .get(RoadsService)
                .routeBetween([0, 0], [0.1, 0]) as RoadRoute;
            const healthy = (await raw(healthyId))?.status.activeTravel;
            const injured = (await raw(injuredId))?.status.activeTravel;
            expect(healthy.duration).toBe(
                durationMsOf(route.baseHours, BASE_SPEED),
            );
            expect(injured.duration).toBe(
                durationMsOf(route.baseHours, BASE_SPEED * 0.8),
            );
            expect(injured.duration / healthy.duration).toBeCloseTo(1.25, 4);
            expect(
                injured.endTime.getTime() - injured.startTime.getTime(),
            ).toBe(injured.duration);
        });

        it('refuses a second standard quest while travelling to the first', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.markerA);
            const firstId = await huntTo(travel.questPoi);
            const secondId = await huntTo(travel.questPoi);
            const pqId = await accept(ownerId, charId, firstId);

            await expect(
                accept(ownerId, charId, secondId),
            ).rejects.toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });

            const character = await raw(charId);
            expect(character?.quests.pendingQuest).toEqual(pqId);
            expect(await pendingCount()).toBe(1);
            expect(queue.added).toHaveLength(1);
        });

        it('starts the countdown at once when the character already stands on the marker', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.questPoi);
            const questId = await huntTo(travel.questPoi);

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.status.activeTravel ?? null).toBeNull();
            expect(character?.status.location).toEqual(travel.questPoi);
            expect((await pendingOf(pqId))?.startDate).toEqual(ACCEPTED_AT);
            expect((await pendingOf(pqId))?.arrivedAt).toEqual(ACCEPTED_AT);
            expect(queue.added).toEqual([]);
        });

        it('jumps to the marker when no road reaches it', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation();
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.markerA);
            const questId = await huntTo(travel.farQuestPoi);

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.status.location).toEqual(travel.farQuestPoi);
            expect(character?.status.activeTravel ?? null).toBeNull();
            expect((await pendingOf(pqId))?.startDate).toEqual(ACCEPTED_AT);
            expect(queue.added).toEqual([]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Nessuna strada dal luogo ${travel.markerA.toHexString()} al marker ${travel.farQuestPoi.toHexString()} della missione ${questId.toHexString()} per il personaggio ${charId.toHexString()}: salto istantaneo`,
            );
            expect(warn.mock.calls[0][0] as string).not.toContain(
                ownerId.toHexString(),
            );
        });

        // la quest sta nella città del personaggio: il marker della città si raggiunge da un suo POI
        describe('city geography on an instant jump', () => {
            async function linkGeography(
                cityId: Types.ObjectId,
                name: string,
            ): Promise<Types.ObjectId[]> {
                const lore = await persistGeographyLore(connection, { name });
                await rawCities().updateOne(
                    { _id: cityId },
                    { $set: { relatedLore: lore.cityLore._id } },
                );
                return lore.geography;
            }

            function hexesOf(ids: readonly Types.ObjectId[]): string[] {
                return ids.map((id) => id.toHexString()).sort();
            }

            beforeEach(() => {
                jest.spyOn(Logger.prototype, 'warn').mockImplementation();
            });

            afterEach(async () => {
                await connection.collection('lores').deleteMany({});
            });

            it('unlocks the city geography on an instant jump to its marker (D-05)', async () => {
                const geography = await linkGeography(travel.cityA, 'Salto');
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.farQuestPoi);
                const questId = await huntTo(travel.markerA);

                await accept(ownerId, charId, questId);

                const character = await raw(charId);
                expect(character?.status.location).toEqual(travel.markerA);
                expect(character?.status.activeTravel ?? null).toBeNull();
                expect(hexesOf(character?.status.unlockedLore ?? [])).toEqual(
                    hexesOf(geography),
                );
            });

            it('unlocks nothing on an instant jump to a territory point of interest (D-05)', async () => {
                await linkGeography(travel.cityA, 'Territorio');
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.markerA);
                const questId = await huntTo(travel.farQuestPoi);

                await accept(ownerId, charId, questId);

                const character = await raw(charId);
                expect(character?.status.location).toEqual(travel.farQuestPoi);
                expect(character?.status.unlockedLore).toEqual([]);
            });

            it('unlocks nothing when the quest starts by travel (D-05)', async () => {
                await linkGeography(travel.cityA, 'Viaggio');
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.questPoi);
                const questId = await huntTo(travel.markerA);

                await accept(ownerId, charId, questId);

                const character = await raw(charId);
                expect(character?.status.activeTravel).toMatchObject({
                    kind: 'quest',
                    to: travel.markerA,
                });
                expect(character?.status.location).toEqual(travel.questPoi);
                expect(character?.status.unlockedLore).toEqual([]);
            });
        });

        // marker nei pointsOfInterest della città ma senza documento POI (D-27): rifiuto prima della transazione, nessuna scrittura
        it('rejects a marker without a point of interest document with QUEST_NOT_ACCEPTABLE and writes nothing', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation();
            const transaction = jest.spyOn(connection, 'transaction');
            const ghost = new Types.ObjectId();
            await rawCities().updateOne(
                { _id: travel.cityA },
                { $push: { pointsOfInterest: ghost } },
            );
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.markerA);
            const questId = await huntTo(ghost);

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_ACCEPTABLE' });

            expect(transaction).not.toHaveBeenCalled();
            const character = await raw(charId);
            expect(character?.status.location).toEqual(travel.markerA);
            expect(character?.status.activeTravel ?? null).toBeNull();
            expect(character?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(queue.added).toEqual([]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                `Marker ${ghost.toHexString()} della missione ${questId.toHexString()} inesistente: accettazione rifiutata`,
            );
            expect(warn.mock.calls[0][0] as string).not.toContain(
                charId.toHexString(),
            );
        });

        it('never moves the character for a story or a world mission', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(travel.markerA);
            const storyId = await huntTo(
                travel.questPoi,
                { requiredPoints: 1000, minTitle: 'rookie' },
                'story',
            );
            const missionId = await huntTo(
                travel.questPoi,
                { requiredPoints: 1000, requiredAdventurers: ANY_THREE },
                'worldMission',
            );

            const storyPq = await accept(ownerId, charId, storyId);
            const missionPq = await accept(ownerId, charId, missionId);

            const character = await raw(charId);
            expect(character?.quests.activeStoryQuest).toEqual(storyPq);
            expect(character?.quests.activeWorldMissionQuest).toEqual(
                missionPq,
            );
            expect(character?.status.location).toEqual(travel.markerA);
            expect(character?.status.activeTravel ?? null).toBeNull();
            expect((await pendingOf(storyPq))?.startDate).toEqual(ACCEPTED_AT);
            expect(queue.added).toEqual([]);
        });

        it('leaves neither travel nor job when the claim is rejected in the transaction', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.markerA);
            const questId = await huntTo(
                travel.questPoi,
                { requiredAdventurers: [{ title: null, count: 1 }] },
                'enemy',
            );
            const transaction = interleaveBeforeTransaction(() =>
                rawQuests().updateOne(
                    { _id: questId },
                    {
                        $push: {
                            registeredAdventurers: {
                                character: new Types.ObjectId(),
                                title: 'rookie',
                            },
                        },
                    },
                ),
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_FULL' });

            expect(transaction).toHaveBeenCalledTimes(1);
            const character = await raw(charId);
            expect(character?.status.activeTravel ?? null).toBeNull();
            expect(character?.status.location).toEqual(travel.markerA);
            expect(character?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(queue.added).toEqual([]);
        });

        it('keeps the acceptance when the queue is unavailable', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation();
            queue.failAdd = true;
            const ownerId = await ownerWith(0);
            const charId = await characterAt(travel.markerA);
            const questId = await huntTo(travel.questPoi);

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.quests.pendingQuest).toEqual(pqId);
            expect(character?.status.activeTravel).toMatchObject({
                kind: 'quest',
                to: travel.questPoi,
            });
            expect((await pendingOf(pqId))?.startDate).toBeNull();
            expect(warn).toHaveBeenCalledWith(
                `Accodamento del viaggio ${travelJobId(charId, ACCEPTED_AT)} fallito: lo completerà lo sweep`,
            );
        });

        describe('food on the automatic travel (D-12)', () => {
            let lootItems: Model<any>;
            let route: RoadRoute;
            let needed: number;

            beforeEach(() => {
                lootItems = app.get<Model<any>>(getModelToken(LootItem.name));
                route = app
                    .get(RoadsService)
                    .routeBetween([0, 0], [0.1, 0]) as RoadRoute;
                needed = foodNeededFor(
                    durationMsOf(route.baseHours, BASE_SPEED),
                );
            });

            function foodOf(id: Types.ObjectId) {
                return raw(id).then((character) => ({
                    ownedItems: character?.assets.ownedItems,
                    lifePoints: character?.status.currentLifePoints,
                }));
            }

            function savedPlanOf(id: Types.ObjectId) {
                return raw(id).then(
                    (character) => character?.status.activeTravel?.food,
                );
            }

            // marker di B aggiunto alla città di A: la strada A→B costa più di un power (numeri reali, D-18)
            async function longHunt(): Promise<{
                questId: Types.ObjectId;
                longRoute: RoadRoute;
            }> {
                await rawCities().updateOne(
                    { _id: travel.cityA },
                    { $push: { pointsOfInterest: travel.markerB } },
                );
                return {
                    questId: await huntTo(travel.markerB),
                    longRoute: app
                        .get(RoadsService)
                        .routeBetween([0, 0], [0, 0.2]) as RoadRoute,
                };
            }

            it('saves the food plan of the automatic travel in the claim without eating (D-05)', async () => {
                expect(needed).toBeGreaterThan(0);
                expect(needed).toBeLessThan(5);
                const food1 = await persistFood(lootItems, 1);
                const food5 = await persistFood(lootItems, 5);
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 100,
                        ownedItems: [
                            foodStack(food1, needed),
                            foodStack(food5, 1),
                        ],
                    },
                );

                const pqId = await accept(
                    ownerId,
                    charId,
                    await huntTo(travel.questPoi),
                );

                const character = await raw(charId);
                expect(character?.assets.ownedItems).toEqual([
                    foodStack(food1, needed),
                    foodStack(food5, 1),
                ]);
                expect(character?.status.currentLifePoints).toBe(100);
                expect(character?.status.activeTravel).toMatchObject({
                    kind: 'quest',
                    to: travel.questPoi,
                });
                expect(character?.status.activeTravel.food).toEqual({
                    needed,
                    uncoveredKm: 0,
                    coveredKm: route.distanceKm,
                    hpLostTotal: 0,
                    settledKm: 0,
                    foodConsumedAt: null,
                });
                expect(character?.quests.pendingQuest).toEqual(pqId);
                expect(await pendingCount()).toBe(1);
                expect(queue.added).toHaveLength(1);
            });

            it('saves the uncovered kilometres of a partial cover in the claim without charging (D-05, D-13)', async () => {
                const food1 = await persistFood(lootItems, 1);
                const { questId, longRoute } = await longHunt();
                const longNeeded = foodNeededFor(
                    durationMsOf(longRoute.baseHours, BASE_SPEED),
                );
                expect(longNeeded).toBeGreaterThan(1);
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 100,
                        ownedItems: [foodStack(food1, 1)],
                    },
                );

                await accept(ownerId, charId, questId);

                const uncoveredKm = uncoveredKmOf(
                    longNeeded,
                    1,
                    longRoute.distanceKm,
                );
                expect(hpLostFor(uncoveredKm)).toBeGreaterThan(0);
                expect(await foodOf(charId)).toEqual({
                    ownedItems: [foodStack(food1, 1)],
                    lifePoints: 100,
                });
                expect((await raw(charId))?.status.activeTravel).toMatchObject({
                    to: travel.markerB,
                });
                expect(await savedPlanOf(charId)).toMatchObject({
                    needed: longNeeded,
                    uncoveredKm,
                    hpLostTotal: hpLostFor(uncoveredKm),
                    settledKm: 0,
                    foodConsumedAt: null,
                });
            });

            it('refuses a starving quest travel before any write (D-11)', async () => {
                const ownerId = await ownerWith(6000);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 1,
                    },
                );
                const questId = await huntTo(
                    travel.questPoi,
                    { requiredAdventurers: [{ title: null, count: 2 }] },
                    'enemy',
                );
                const before = await raw(charId);
                const transaction = jest.spyOn(connection, 'transaction');

                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({ code: 'TRAVEL_STARVING' });

                expect(transaction).not.toHaveBeenCalled();
                expect(await raw(charId)).toEqual(before);
                expect(await pendingCount()).toBe(0);
                expect(
                    (await rawQuest(questId))?.registeredAdventurers ?? [],
                ).toEqual([]);
                expect(await pointsOf(ownerId)).toBe(6000);
                expect(queue.added).toEqual([]);
                expect(questQueue.added).toEqual([]);
            });

            it('refuses with TRAVEL_STARVING inside the transaction when the food vanishes (D-11)', async () => {
                const food1 = await persistFood(lootItems, 1);
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 1,
                        ownedItems: [foodStack(food1, needed)],
                    },
                );
                const transaction = interleaveBeforeTransaction(() =>
                    characters.collection.updateOne(
                        { _id: charId },
                        { $set: { 'assets.ownedItems': [] } },
                    ),
                );

                await expect(
                    accept(ownerId, charId, await huntTo(travel.questPoi)),
                ).rejects.toMatchObject({ code: 'TRAVEL_STARVING' });

                expect(transaction).toHaveBeenCalledTimes(1);
                const character = await raw(charId);
                expect(character?.quests.pendingQuest).toBeNull();
                expect(character?.status.activeTravel ?? null).toBeNull();
                expect(character?.status.currentLifePoints).toBe(1);
                expect(await pendingCount()).toBe(0);
                expect(queue.added).toEqual([]);
            });

            it('answers the race code before the hunger when the lane is taken in the meantime (D-11)', async () => {
                const food1 = await persistFood(lootItems, 1);
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 1,
                        ownedItems: [foodStack(food1, needed)],
                    },
                );
                const rivalLane = new Types.ObjectId();
                interleaveBeforeTransaction(() =>
                    characters.collection.updateOne(
                        { _id: charId },
                        {
                            $set: {
                                'assets.ownedItems': [],
                                'quests.pendingQuest': rivalLane,
                            },
                        },
                    ),
                );

                await expect(
                    accept(ownerId, charId, await huntTo(travel.questPoi)),
                ).rejects.toMatchObject({ code: 'QUEST_SLOT_BUSY' });

                expect((await raw(charId))?.quests.pendingQuest).toEqual(
                    rivalLane,
                );
                expect(await pendingCount()).toBe(0);
                expect(queue.added).toEqual([]);
            });

            it('does not eat on an instant jump nor on a marker at the position (D-13)', async () => {
                jest.spyOn(Logger.prototype, 'warn').mockImplementation();
                const read = jest.spyOn(app.get(TravelPantryReader), 'read');
                const food20 = await persistFood(lootItems, 20);
                const larder = {
                    lifePoints: 100,
                    ownedItems: [foodStack(food20, 3)],
                };
                const ownerId = await ownerWith(0);
                const jumperId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    larder,
                );
                const standingId = await characterAt(
                    travel.questPoi,
                    'rookie',
                    {},
                    larder,
                );
                const untouched = {
                    ownedItems: [foodStack(food20, 3)],
                    lifePoints: 100,
                };

                await accept(
                    ownerId,
                    jumperId,
                    await huntTo(travel.farQuestPoi),
                );
                await accept(
                    ownerId,
                    standingId,
                    await huntTo(travel.questPoi),
                );

                expect(await foodOf(jumperId)).toEqual(untouched);
                expect(await foodOf(standingId)).toEqual(untouched);
                expect((await raw(jumperId))?.status.location).toEqual(
                    travel.farQuestPoi,
                );
                expect(
                    (await raw(jumperId))?.status.activeTravel ?? null,
                ).toBeNull();
                expect(
                    (await raw(standingId))?.status.activeTravel ?? null,
                ).toBeNull();
                expect(read).not.toHaveBeenCalled();
            });

            it('does not eat on story and world mission quests (D-13)', async () => {
                const read = jest.spyOn(app.get(TravelPantryReader), 'read');
                const food20 = await persistFood(lootItems, 20);
                const larder = {
                    lifePoints: 1,
                    ownedItems: [foodStack(food20, 3)],
                };
                const ownerId = await ownerWith(6000);
                const storyHero = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    larder,
                );
                const missionHero = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    larder,
                );
                const storyId = await huntTo(
                    travel.questPoi,
                    { requiredPoints: 1000, minTitle: 'rookie' },
                    'story',
                );
                const missionId = await huntTo(
                    travel.questPoi,
                    { requiredPoints: 1000, requiredAdventurers: ANY_THREE },
                    'worldMission',
                );

                await accept(ownerId, storyHero, storyId);
                await accept(ownerId, missionHero, missionId);

                const untouched = {
                    ownedItems: [foodStack(food20, 3)],
                    lifePoints: 1,
                };
                expect(await foodOf(storyHero)).toEqual(untouched);
                expect(await foodOf(missionHero)).toEqual(untouched);
                expect(
                    (await raw(storyHero))?.quests.activeStoryQuest,
                ).not.toBeNull();
                expect(
                    (await raw(missionHero))?.quests.activeWorldMissionQuest,
                ).not.toBeNull();
                expect(read).not.toHaveBeenCalled();
            });

            it('lets exactly one of two concurrent quest departures save its food plan (D-05, D-14)', async () => {
                const food1 = await persistFood(lootItems, 1);
                const food5 = await persistFood(lootItems, 5);
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 100,
                        ownedItems: [
                            foodStack(food1, needed),
                            foodStack(food5, 1),
                        ],
                    },
                );
                const firstId = await huntTo(travel.questPoi);
                const secondId = await huntTo(travel.questPoi);

                const results = await Promise.allSettled([
                    accept(ownerId, charId, firstId),
                    accept(ownerId, charId, secondId),
                ]);

                const rejected = results.filter((r) => r.status === 'rejected');
                expect(
                    results.filter((r) => r.status === 'fulfilled'),
                ).toHaveLength(1);
                expect(rejected).toHaveLength(1);
                expect(['QUEST_SLOT_BUSY', 'TRAVEL_IN_PROGRESS']).toContain(
                    codeOf(rejected[0]),
                );
                const character = await raw(charId);
                expect(character?.assets.ownedItems).toEqual([
                    foodStack(food1, needed),
                    foodStack(food5, 1),
                ]);
                expect(character?.status.activeTravel.food).toEqual({
                    needed,
                    uncoveredKm: 0,
                    coveredKm: route.distanceKm,
                    hpLostTotal: 0,
                    settledKm: 0,
                    foodConsumedAt: null,
                });
                expect(await pendingCount()).toBe(1);
                expect(queue.added).toHaveLength(1);
            });

            // la seconda lettura è la prima del callback: l'acquisto arriva dopo la lettura in sessione e prima del claim
            it('keeps a concurrent purchase made after the pantry read of the claim without eating (D-05, D-14)', async () => {
                const pantryReader = app.get(TravelPantryReader);
                const food1 = await persistFood(lootItems, 1);
                const potion = await persistLootItem(lootItems, {
                    name: 'Pozione di prova',
                });
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        lifePoints: 100,
                        ownedItems: [foodStack(food1, needed + 3)],
                    },
                );
                const original = pantryReader.read.bind(pantryReader);
                const read = jest
                    .spyOn(pantryReader, 'read')
                    .mockImplementation(async (characterId, session) => {
                        const pantry = await original(characterId, session);
                        if (read.mock.calls.length === 2)
                            await characters.updateOne(
                                { _id: characterId },
                                {
                                    $push: {
                                        'assets.ownedItems': foodStack(
                                            potion,
                                            1,
                                        ),
                                    },
                                },
                            );
                        return pantry;
                    });

                await accept(ownerId, charId, await huntTo(travel.questPoi));

                expect((await raw(charId))?.assets.ownedItems).toEqual([
                    foodStack(food1, needed + 3),
                    foodStack(potion, 1),
                ]);
                expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
                expect(read.mock.calls[1][1]).not.toBeNull();
            });

            it('saves the food need of the slower march of an injured character (D-01, D-05)', async () => {
                const food1 = await persistFood(lootItems, 1);
                const ownerId = await ownerWith(0);
                const charId = await characterAt(
                    travel.markerA,
                    'rookie',
                    {},
                    {
                        ownedItems: [foodStack(food1, LARDER)],
                    },
                );
                await characters.collection.updateOne(
                    { _id: charId },
                    { $set: { 'status.injuries': ['brokenLeftLeg'] } },
                );

                await accept(ownerId, charId, await huntTo(travel.questPoi));

                const injured = foodNeededFor(
                    durationMsOf(route.baseHours, BASE_SPEED * 0.8),
                );
                expect((await savedPlanOf(charId))?.needed).toBe(injured);
                expect((await raw(charId))?.assets.ownedItems).toEqual([
                    foodStack(food1, LARDER),
                ]);
                expect(injured).toBeGreaterThan(needed);
            });
        });

        describe('resolution job where the countdown starts (D-24, C8)', () => {
            function resolveJobOf(pqId: Types.ObjectId, waitingTime: number) {
                const hex = pqId.toHexString();
                return {
                    name: 'resolve',
                    data: {
                        pendingQuestId: hex,
                        startDate: ACCEPTED_AT.getTime(),
                        waitingTime,
                    },
                    options: {
                        jobId: `quest-${hex}-${ACCEPTED_AT.getTime()}`,
                        delay: waitingTime,
                        removeOnComplete: true,
                        removeOnFail: FAILED_JOBS_KEPT,
                    },
                };
            }

            it('enqueues the resolution when the character stands on the marker', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.questPoi);

                const pqId = await accept(
                    ownerId,
                    charId,
                    await huntTo(travel.questPoi),
                );

                expect(questQueue.added).toEqual([resolveJobOf(pqId, 60000)]);
                const { startDate } = questQueue.added[0].data as {
                    startDate: number;
                };
                expect((await pendingOf(pqId))?.startDate).toEqual(
                    new Date(startDate),
                );
            });

            it('enqueues the resolution after a jump without road', async () => {
                jest.spyOn(Logger.prototype, 'warn').mockImplementation();
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.markerA);

                const pqId = await accept(
                    ownerId,
                    charId,
                    await huntTo(travel.farQuestPoi),
                );

                expect(questQueue.added).toEqual([resolveJobOf(pqId, 60000)]);
            });

            it('waits for the arrival when the acceptance starts a travel', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.markerA);

                await accept(ownerId, charId, await huntTo(travel.questPoi));

                expect(queue.added).toHaveLength(1);
                expect(questQueue.added).toEqual([]);
            });

            it('never enqueues a resolution for a story or a world mission', async () => {
                const ownerId = await ownerWith(6000);
                const charId = await characterAt(travel.questPoi);
                const storyId = await huntTo(
                    travel.questPoi,
                    { requiredPoints: 1000, minTitle: 'rookie' },
                    'story',
                );
                const missionId = await huntTo(
                    travel.questPoi,
                    { requiredPoints: 1000, requiredAdventurers: ANY_THREE },
                    'worldMission',
                );

                await accept(ownerId, charId, storyId);
                await accept(ownerId, charId, missionId);

                expect(questQueue.added).toEqual([]);
            });

            it('enqueues nothing when the acceptance is rejected', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.questPoi);
                const firstPq = await accept(
                    ownerId,
                    charId,
                    await huntTo(travel.questPoi),
                );

                await expect(
                    accept(ownerId, charId, await huntTo(travel.questPoi)),
                ).rejects.toMatchObject({ code: 'QUEST_SLOT_BUSY' });

                expect(questQueue.added).toEqual([
                    resolveJobOf(firstPq, 60000),
                ]);
            });

            it('keeps the acceptance when the resolution queue is unavailable', async () => {
                const warn = jest
                    .spyOn(Logger.prototype, 'warn')
                    .mockImplementation();
                questQueue.failAdd = true;
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.questPoi);

                const pqId = await accept(
                    ownerId,
                    charId,
                    await huntTo(travel.questPoi),
                );

                expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
                expect((await pendingOf(pqId))?.startDate).toEqual(ACCEPTED_AT);
                expect(warn).toHaveBeenCalledWith(
                    `Accodamento della risoluzione quest-${pqId.toHexString()}-${ACCEPTED_AT.getTime()} fallito: lo risolverà lo sweep`,
                );
            });

            // l'avvio da soli nasce con il claim: nessuna scrittura dopo il commit da cui dipenda
            it('starts a solo quest accepted on its marker at the commit (D-22)', async () => {
                const tryStart = jest
                    .spyOn(QuestStartService.prototype, 'tryStart')
                    .mockResolvedValue('stale');
                const ownerId = await ownerWith(0);
                const charId = await characterAt(travel.questPoi);

                const pqId = await accept(
                    ownerId,
                    charId,
                    await huntTo(travel.questPoi),
                );

                expect((await pendingOf(pqId))?.startDate).toEqual(ACCEPTED_AT);
                expect((await pendingOf(pqId))?.arrivedAt).toEqual(ACCEPTED_AT);
                expect(questQueue.added).toEqual([resolveJobOf(pqId, 60000)]);
                expect(tryStart).not.toHaveBeenCalled();
            });
        });
    });

    describe('city (D-26)', () => {
        it('accepts from a point of interest of the quest city', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(world.cityPoi);
            const questId = await questOf('hunt');

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
        });

        it('accepts a story from another city', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(await otherCityMarker());
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.activeStoryQuest).toEqual(pqId);
            expect(await pointsOf(ownerId)).toBe(5000);
        });

        it('rejects a world mission from another city with QUEST_NOT_IN_CITY and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(await otherCityMarker());
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_IN_CITY' });

            expect(
                (await raw(charId))?.quests.activeWorldMissionQuest ?? null,
            ).toBeNull();
            expect(
                (await rawQuest(questId))?.registeredAdventurers ?? [],
            ).toEqual([]);
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('accepts a world mission from a point of interest of the quest city', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityPoi);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });

            const pqId = await accept(ownerId, charId, questId);

            const character = await raw(charId);
            expect(character?.quests.activeWorldMissionQuest).toEqual(pqId);
            expect(character?.status.location).toEqual(world.cityPoi);
            expect(character?.status.activeTravel ?? null).toBeNull();
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                {
                    character: charId,
                    title: 'rookie',
                    registeredAt: ACCEPTED_AT,
                },
            ]);
            expect(await pointsOf(ownerId)).toBe(3000);
        });

        it('rejects a hunt from another city with QUEST_NOT_IN_CITY and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(await otherCityMarker());
            const questId = await questOf('hunt');

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_IN_CITY' });

            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('rejects a world mission of a character without a location with QUEST_NOT_IN_CITY and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'hero');
            await characters.collection.updateOne(
                { _id: charId },
                { $unset: { 'status.location': '' } },
            );
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: [{ title: 'hero', count: 1 }],
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_IN_CITY' });

            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
        });

        it('rejects a quest whose marker belongs to no city with QUEST_NOT_IN_CITY', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf(
                'hunt',
                {},
                { markerLocation: new Types.ObjectId() },
            );

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_IN_CITY' });

            expect((await raw(charId))?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
        });
    });

    describe('registered quests (D-27, D-28, D-32)', () => {
        function winnersOf(results: PromiseSettledResult<unknown>[]) {
            return results.filter((r) => r.status === 'fulfilled');
        }

        function losersOf(results: PromiseSettledResult<unknown>[]) {
            return results.filter((r) => r.status === 'rejected').map(codeOf);
        }

        it('registers the world mission adventurer by rank', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'hero');
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: [{ title: 'hero', count: 1 }],
            });

            await accept(ownerId, charId, questId);

            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                { character: charId, title: 'hero', registeredAt: ACCEPTED_AT },
            ]);
        });

        it('registers the first adventurer of a legacy quest stored without the registration list', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'hero');
            const questId = await insertQuest('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: [{ title: 'hero', count: 1 }],
            });
            await rawQuests().updateOne(
                { _id: questId },
                { $unset: { registeredAdventurers: '' } },
            );

            await accept(ownerId, charId, questId);

            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                { character: charId, title: 'hero', registeredAt: ACCEPTED_AT },
            ]);
            expect(await pointsOf(ownerId)).toBe(3000);
        });

        it('registers an enemy with a wildcard slot and fills it once', async () => {
            const { owners, chars } = await heroesRacing(2, 'adventurer');
            const questId = await questOf('enemy', {
                requiredAdventurers: [{ title: null, count: 1 }],
            });

            const results = await Promise.allSettled(
                chars.map((charId, i) => accept(owners[i], charId, questId)),
            );

            expect(winnersOf(results)).toHaveLength(1);
            expect(losersOf(results)).toEqual(['QUEST_FULL']);
            const winner = results.findIndex((r) => r.status === 'fulfilled');
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                {
                    character: chars[winner],
                    title: 'adventurer',
                    registeredAt: ACCEPTED_AT,
                },
            ]);
            expect(await pendingCount()).toBe(1);
        });

        it('registers an aid quest', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('aid', {
                requiredAdventurers: [{ title: null, count: 2 }],
            });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                {
                    character: charId,
                    title: 'rookie',
                    registeredAt: ACCEPTED_AT,
                },
            ]);
        });

        it.each([
            [[]],
            [1],
            [null],
            [[{ title: 'king', count: 1 }]],
            [[{ title: 'hero', count: 0 }]],
        ])(
            'rejects an enemy whose requiredAdventurers is %p with QUEST_NOT_ACCEPTABLE',
            async (requiredAdventurers) => {
                const warn = jest
                    .spyOn(Logger.prototype, 'warn')
                    .mockImplementation();
                const ownerId = await ownerWith(6000);
                const charId = await characterAt(world.cityMarker);
                const questId = await insertQuest('enemy', {
                    requiredAdventurers,
                });

                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({ code: 'QUEST_NOT_ACCEPTABLE' });

                expect((await raw(charId))?.quests.pendingQuest).toBeNull();
                expect(
                    (await rawQuest(questId))?.registeredAdventurers,
                ).toEqual([]);
                expect(await pendingCount()).toBe(0);
                expect(warn).toHaveBeenCalledTimes(1);
                expect(warn).toHaveBeenCalledWith(
                    `Missione ${questId.toHexString()} non accettabile: requiredAdventurers non valido`,
                );
            },
        );

        it('ignores the slots of a hunt', async () => {
            const { owners, chars } = await heroesRacing(2, 'rookie');
            const questId = await insertQuest('hunt', {
                requiredAdventurers: 1,
            });

            for (const [i, charId] of chars.entries()) {
                await accept(owners[i], charId, questId);
            }

            expect(await pendingCount()).toBe(2);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
        });

        it('lets one of a hero and a paladin take the only hero slot', async () => {
            const hero = await heroesRacing(1, 'hero');
            const paladin = await heroesRacing(1, 'paladin');
            const owners = [...hero.owners, ...paladin.owners];
            const chars = [...hero.chars, ...paladin.chars];
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: [{ title: 'hero', count: 1 }],
            });

            const results = await Promise.allSettled(
                chars.map((charId, i) => accept(owners[i], charId, questId)),
            );

            expect(winnersOf(results)).toHaveLength(1);
            expect(losersOf(results)).toEqual(['QUEST_FULL']);
            expect(results[0].status).toBe('fulfilled');
            expect(
                (await rawQuest(questId))?.registeredAdventurers,
            ).toHaveLength(1);
            expect(await pendingCount()).toBe(1);
            expect(await pointsOf(owners[1])).toBe(6000);
            expect(
                (await raw(chars[1]))?.quests.activeWorldMissionQuest,
            ).toBeNull();
        });

        it('applies the canonical case shared with the FE', async () => {
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: [
                    { title: 'hero', count: 1 },
                    { title: null, count: 2 },
                ],
            });
            const registered = [
                { character: new Types.ObjectId(), title: 'paladin' },
                { character: new Types.ObjectId(), title: 'mage' },
            ];
            await rawQuests().updateOne(
                { _id: questId },
                { $push: { registeredAdventurers: { $each: registered } } },
            );
            const paladinOwner = await ownerWith(6000);
            const paladin = await characterAt(world.cityMarker, 'paladin');
            const heroOwner = await ownerWith(6000);
            const hero = await characterAt(world.cityMarker, 'hero');

            await expect(
                accept(paladinOwner, paladin, questId),
            ).rejects.toMatchObject({ code: 'QUEST_FULL' });
            await accept(heroOwner, hero, questId);

            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                ...registered,
                { character: hero, title: 'hero', registeredAt: ACCEPTED_AT },
            ]);
            expect(await pointsOf(paladinOwner)).toBe(6000);
            expect(await pointsOf(heroOwner)).toBe(3000);
        });

        it('fills exact seats before wildcards under concurrency', async () => {
            const { owners, chars } = await heroesRacing(3, 'hero');
            const questId = await questOf('worldMission', {
                requiredPoints: 1000,
                requiredAdventurers: [
                    { title: 'hero', count: 1 },
                    { title: null, count: 1 },
                ],
            });

            const results = await Promise.allSettled(
                chars.map((charId, i) => accept(owners[i], charId, questId)),
            );

            expect(winnersOf(results)).toHaveLength(2);
            expect(losersOf(results)).toEqual(['QUEST_FULL']);
            expect(
                (await rawQuest(questId))?.registeredAdventurers,
            ).toHaveLength(2);
            expect(await pendingCount()).toBe(2);
        });

        const seatCases: [string, RankSlot[], TitleType[], TitleType][] = [
            [
                'an exact seat still free',
                [{ title: TitleType.hero, count: 1 }],
                [],
                TitleType.hero,
            ],
            [
                'an exact seat taken',
                [{ title: TitleType.hero, count: 1 }],
                [TitleType.hero],
                TitleType.hero,
            ],
            [
                'the canonical paladin',
                [
                    { title: TitleType.hero, count: 1 },
                    { title: null, count: 2 },
                ],
                [TitleType.paladin, TitleType.mage],
                TitleType.paladin,
            ],
            [
                'the canonical hero',
                [
                    { title: TitleType.hero, count: 1 },
                    { title: null, count: 2 },
                ],
                [TitleType.paladin, TitleType.mage],
                TitleType.hero,
            ],
            [
                'a wildcard taken by an overflow',
                [{ title: null, count: 1 }],
                [TitleType.legend],
                TitleType.rookie,
            ],
            [
                'a legend on a hero seat (D-08)',
                [{ title: TitleType.hero, count: 1 }],
                [],
                TitleType.legend,
            ],
            [
                'a legend after the hero seat is taken (D-08)',
                [{ title: TitleType.hero, count: 1 }],
                [TitleType.legend],
                TitleType.hero,
            ],
            [
                'a legend on the legend seat first (D-08)',
                [
                    { title: TitleType.legend, count: 1 },
                    { title: TitleType.hero, count: 1 },
                ],
                [TitleType.legend],
                TitleType.legend,
            ],
        ];

        it.each(seatCases)(
            'the registration filter mirrors hasSeatFor on the replica set (%s)',
            async (_name, slots, titles, title) => {
                const registered = titles.map((t) => ({
                    character: new Types.ObjectId(),
                    title: t,
                }));
                const questId = await insertQuest(
                    'worldMission',
                    { requiredAdventurers: slots },
                    registered,
                );
                const rule = slotRuleOf(slots);

                const matches = !!(await quests.exists({
                    _id: questId,
                    $expr: seatAvailableExpr(rule, title),
                }));

                expect(matches).toBe(hasSeatFor(rule, registered, title));
            },
        );

        it('lets a legend character accept a generated hero enemy quest (D-08)', async () => {
            const { owners, chars } = await heroesRacing(2, 'legend');
            const base = buildQuest();
            const quest = await persistQuest(quests, {
                generated: true,
                infos: {
                    ...base.infos,
                    type: 'enemy',
                    markerLocation: world.questMarker,
                },
                requirements: {
                    ...base.requirements,
                    minTitle: 'hero',
                    requiredAdventurers: [{ title: 'hero', count: 1 }],
                },
            });
            const questId = quest._id as Types.ObjectId;

            await accept(owners[0], chars[0], questId);

            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                {
                    character: chars[0],
                    title: 'legend',
                    registeredAt: ACCEPTED_AT,
                },
            ]);
            await expect(
                accept(owners[1], chars[1], questId),
            ).rejects.toMatchObject({ code: 'QUEST_FULL' });
            expect(
                (await rawQuest(questId))?.registeredAdventurers,
            ).toHaveLength(1);
        });

        describe('enemy quests taken by one player of a sufficient rank (quick 261111-enm)', () => {
            const SEAT_SHAPES: [string, string | null][] = [
                ['a seat without a title', null],
                ['the rank-exact seat written before the rule', 'rookie'],
            ];

            async function generatedQuestOf(
                type: string,
                minTitle: string,
                seat: { title: string | null; count: number },
            ): Promise<Types.ObjectId> {
                const base = buildQuest();
                const quest = await persistQuest(quests, {
                    generated: true,
                    infos: {
                        ...base.infos,
                        type,
                        markerLocation: world.questMarker,
                    },
                    requirements: {
                        ...base.requirements,
                        minTitle,
                        requiredAdventurers: [seat],
                    },
                });
                return quest._id as Types.ObjectId;
            }

            it.each(SEAT_SHAPES)(
                'lets a paladin take a rookie enemy quest with %s, starts it and refuses a second taker',
                async (_label, title) => {
                    const { owners, chars } = await heroesRacing(2, 'paladin');
                    const questId = await generatedQuestOf('enemy', 'rookie', {
                        title,
                        count: 1,
                    });

                    const pqId = await accept(owners[0], chars[0], questId);

                    const quest = await rawQuest(questId);
                    expect(quest?.registeredAdventurers).toEqual([
                        {
                            character: chars[0],
                            title: 'paladin',
                            registeredAt: ACCEPTED_AT,
                        },
                    ]);
                    expect(quest?.startedAt).toEqual(ACCEPTED_AT);
                    expect((await pendingOf(pqId))?.startDate).toEqual(
                        ACCEPTED_AT,
                    );
                    expect(
                        questQueue.added.filter(
                            ({ name }) => name === 'resolve',
                        ),
                    ).toHaveLength(1);
                    await expect(
                        accept(owners[1], chars[1], questId),
                    ).rejects.toMatchObject({ code: 'QUEST_FULL' });
                    expect(
                        (await rawQuest(questId))?.registeredAdventurers,
                    ).toHaveLength(1);
                    expect(await pendingCount()).toBe(1);
                },
            );

            it.each(SEAT_SHAPES)(
                'lets exactly one of an adventurer, a hero and a legend racing take the enemy quest with %s',
                async (_label, title) => {
                    const titles = ['adventurer', 'hero', 'legend'];
                    const owners: Types.ObjectId[] = [];
                    const chars: Types.ObjectId[] = [];
                    for (const rank of titles) {
                        owners.push(await ownerWith(0));
                        chars.push(await characterAt(world.cityMarker, rank));
                    }
                    const questId = await generatedQuestOf('enemy', 'rookie', {
                        title,
                        count: 1,
                    });

                    const results = await Promise.allSettled(
                        chars.map((charId, i) =>
                            accept(owners[i], charId, questId),
                        ),
                    );

                    expect(winnersOf(results)).toHaveLength(1);
                    expect(losersOf(results)).toEqual([
                        'QUEST_FULL',
                        'QUEST_FULL',
                    ]);
                    expect(
                        (await rawQuest(questId))?.registeredAdventurers,
                    ).toHaveLength(1);
                    expect(await pendingCount()).toBe(1);
                },
            );

            it.each([null, 'paladin'])(
                'refuses a rookie on a paladin enemy quest with the seat title %p and writes nothing',
                async (title) => {
                    const ownerId = await ownerWith(0);
                    const charId = await characterAt(world.cityMarker);
                    const questId = await generatedQuestOf('enemy', 'paladin', {
                        title,
                        count: 1,
                    });

                    await expect(
                        accept(ownerId, charId, questId),
                    ).rejects.toMatchObject({ code: 'QUEST_TITLE_MISMATCH' });

                    expect(
                        (await rawQuest(questId))?.registeredAdventurers,
                    ).toEqual([]);
                    expect(await pendingCount()).toBe(0);
                },
            );

            it('keeps the seats of a generated boss rank-exact', async () => {
                const { owners, chars } = await heroesRacing(1, 'paladin');
                const questId = await generatedQuestOf('boss', 'rookie', {
                    title: 'rookie',
                    count: 2,
                });

                await expect(
                    accept(owners[0], chars[0], questId),
                ).rejects.toMatchObject({ code: 'QUEST_FULL' });

                expect(
                    (await rawQuest(questId))?.registeredAdventurers,
                ).toEqual([]);
            });
        });

        it('lets exactly one of two concurrent legends take the last hero seat (D-08)', async () => {
            const { owners, chars } = await heroesRacing(2, 'legend');
            const questId = await questOf('boss', {
                minTitle: 'hero',
                requiredAdventurers: [{ title: 'hero', count: 1 }],
            });

            const results = await Promise.allSettled(
                chars.map((charId, i) => accept(owners[i], charId, questId)),
            );

            expect(winnersOf(results)).toHaveLength(1);
            expect(losersOf(results)).toEqual(['QUEST_FULL']);
            expect(
                (await rawQuest(questId))?.registeredAdventurers,
            ).toHaveLength(1);
        });

        it('leaves no registration when the points are insufficient', async () => {
            const ownerId = await ownerWith(100);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });

            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
            expect(
                (await raw(charId))?.quests.activeWorldMissionQuest,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
        });

        it('registers a boss in the standard lane without any cost', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('boss', {
                requiredAdventurers: [{ title: 'rookie', count: 2 }],
                requiredPoints: 4000,
            });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
            expect((await pendingOf(pqId))?.pointsSpent).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                {
                    character: charId,
                    title: 'rookie',
                    registeredAt: ACCEPTED_AT,
                },
            ]);
        });

        it('never registers story adventurers', async () => {
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
                requiredAdventurers: [{ title: null, count: 1 }],
            });
            const { owners, chars } = await heroesRacing(2, 'rookie');

            for (const [i, charId] of chars.entries()) {
                await accept(owners[i], charId, questId);
            }

            expect(await pendingCount()).toBe(2);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual(
                [],
            );
        });

        describe('party start (utente 2026-10-25)', () => {
            const TWO_SEATS = [{ title: null, count: 2 }];

            const resolveJobs = () =>
                questQueue.added.filter(({ name }) => name === 'resolve');

            it('keeps a boss waiting on the marker until the party is complete', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(world.cityMarker);
                const questId = await questOf('boss', {
                    requiredAdventurers: TWO_SEATS,
                });

                const pqId = await accept(ownerId, charId, questId);

                const pending = await pendingOf(pqId);
                expect(pending?.arrivedAt).toEqual(ACCEPTED_AT);
                expect(pending?.startDate).toBeNull();
                const quest = await rawQuest(questId);
                expect(quest?.registeredAdventurers).toEqual([
                    {
                        character: charId,
                        title: 'rookie',
                        registeredAt: ACCEPTED_AT,
                    },
                ]);
                expect(quest?.startedAt).toBeNull();
                expect(resolveJobs()).toEqual([]);
            });

            it('starts the whole party when the last seat is taken on the marker', async () => {
                const { owners, chars } = await heroesRacing(2, 'rookie');
                const questId = await questOf('boss', {
                    requiredAdventurers: TWO_SEATS,
                });

                const firstPq = await accept(owners[0], chars[0], questId);
                const secondPq = await accept(owners[1], chars[1], questId);

                expect((await pendingOf(firstPq))?.startDate).toEqual(
                    ACCEPTED_AT,
                );
                expect((await pendingOf(secondPq))?.startDate).toEqual(
                    ACCEPTED_AT,
                );
                expect((await rawQuest(questId))?.startedAt).toEqual(
                    ACCEPTED_AT,
                );
                expect(resolveJobs()).toHaveLength(2);
            });

            it('starts a single seat enemy at once', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(world.cityMarker);
                const questId = await questOf('enemy', {
                    requiredAdventurers: [{ title: null, count: 1 }],
                });

                const pqId = await accept(ownerId, charId, questId);

                expect((await pendingOf(pqId))?.startDate).toEqual(ACCEPTED_AT);
                expect(resolveJobs()).toHaveLength(1);
            });

            const partyTimeoutJobs = () =>
                questQueue.added.filter(({ name }) => name === 'party-timeout');

            it('opens the 24 hour window at the first registration only', async () => {
                const { owners, chars } = await heroesRacing(3, 'rookie');
                const questId = await questOf('boss', {
                    requiredAdventurers: [{ title: null, count: 3 }],
                });

                await accept(owners[0], chars[0], questId);
                await accept(owners[1], chars[1], questId);

                const hex = questId.toHexString();
                expect(partyTimeoutJobs()).toEqual([
                    {
                        name: 'party-timeout',
                        data: { questId: hex, since: ACCEPTED_AT.getTime() },
                        options: expect.objectContaining({
                            jobId: `party-${hex}-${ACCEPTED_AT.getTime()}`,
                        }),
                    },
                ]);
            });

            it('opens no window for a single seat enemy', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(world.cityMarker);
                const questId = await questOf('enemy', {
                    requiredAdventurers: [{ title: null, count: 1 }],
                });

                await accept(ownerId, charId, questId);

                expect(partyTimeoutJobs()).toEqual([]);
            });

            it('keeps the acceptance and opens the window when the start fails after the commit', async () => {
                const error = jest
                    .spyOn(Logger.prototype, 'error')
                    .mockImplementation();
                const ownerId = await ownerWith(0);
                const charId = await characterAt(world.cityMarker);
                const questId = await questOf('boss', {
                    requiredAdventurers: TWO_SEATS,
                });
                const failure = Object.assign(new Error('raw driver message'), {
                    code: 112,
                });
                jest.spyOn(quests, 'findById').mockImplementationOnce(() => {
                    throw failure;
                });

                const pqId = await accept(ownerId, charId, questId);

                expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
                expect((await pendingOf(pqId))?.arrivedAt).toEqual(ACCEPTED_AT);
                expect(partyTimeoutJobs()).toHaveLength(1);
                const messages = error.mock.calls.map(([value]) =>
                    String(value),
                );
                expect(messages).toEqual([
                    expect.stringContaining(questId.toHexString()),
                ]);
                expect(messages[0]).toContain(pqId.toHexString());
                expect(messages[0]).toContain('code 112');
                expect(messages[0]).not.toContain('raw driver message');
            });

            it('rejects a registration on a started quest with QUEST_FULL and writes nothing', async () => {
                const ownerId = await ownerWith(0);
                const charId = await characterAt(world.cityMarker);
                const questId = await questOf('boss', {
                    requiredAdventurers: TWO_SEATS,
                });
                await quests.collection.updateOne(
                    { _id: questId },
                    { $set: { startedAt: ACCEPTED_AT } },
                );

                await expect(
                    accept(ownerId, charId, questId),
                ).rejects.toMatchObject({ code: 'QUEST_FULL' });

                expect((await raw(charId))?.quests.pendingQuest).toBeNull();
                expect(
                    (await rawQuest(questId))?.registeredAdventurers,
                ).toEqual([]);
                expect(await pendingCount()).toBe(0);
                expect(questQueue.added).toEqual([]);
            });
        });
    });
});

// mondo ≥ 10 km e caso a sequenza (Phase 15): modulo e database propri, i casi esistenti restano sul loro mondo
describe('QuestAcceptanceService ambush at departure (Phase 15)', () => {
    let app: INestApplication;
    let acceptance: QuestAcceptanceService;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let quests: Model<QuestDocument>;
    let users: Model<UserDocument>;
    let world: AmbushWorld;
    let seq = 0;
    const queue = new FakeTravelQueue();
    const chance = new SequenceChance();

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'quest-acceptance-ambush-test',
                }),
                QuestAcceptanceModule,
            ],
        })
            .overrideProvider(getQueueToken(TRAVEL_QUEUE))
            .useValue(queue)
            .overrideProvider(getQueueToken(QUEST_RESOLUTION_QUEUE))
            .useValue(new FakeTravelQueue())
            .overrideProvider(Clock)
            .useValue(new FixedClock(ACCEPTED_AT))
            .overrideProvider(ChanceSource)
            .useValue(chance)
            .compile();
        app = moduleRef.createNestApplication();
        await app.init();
        acceptance = app.get(QuestAcceptanceService);
        connection = app.get<Connection>(getConnectionToken());
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        quests = app.get<Model<QuestDocument>>(getModelToken(Quest.name));
        users = app.get<Model<UserDocument>>(getModelToken(User.name));
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            quests.init(),
            app
                .get<
                    Model<PendingQuestDocument>
                >(getModelToken(PendingQuest.name))
                .init(),
            users.init(),
            app.get<Model<CityDocument>>(getModelToken(City.name)).init(),
            ...TRAVEL_COLLECTIONS.map((name) =>
                connection.createCollection(name).catch(() => undefined),
            ),
        ]);
    });

    beforeEach(async () => {
        for (const collection of Object.values(connection.collections))
            await collection.deleteMany({});
        world = await persistAmbushWorld(connection, app.get(RoadsService));
        queue.reset();
        // la prima estrazione colpisce sempre: imboscata al km 1 se la strada la ammette
        chance.load([0]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    async function ruinsQuestAtAlba(): Promise<{
        ownerId: Types.ObjectId;
        characterId: Types.ObjectId;
        questId: Types.ObjectId;
    }> {
        seq += 1;
        const owner = await persistUser(users, {
            twitchId: `twitch-acceptance-ambush-${seq}`,
            twitchPoints: 0,
        });
        const base = buildCharacter();
        const character = await persistCharacter(characters, {
            infos: { ...base.infos, name: `Eroe imboscato ${seq}` },
            status: {
                ...base.status,
                location: world.markers.alba,
                title: 'rookie',
                currentLifePoints: HARDY_LIFE_POINTS,
                maxLifePoints: HARDY_LIFE_POINTS,
            },
            quests: { completedQuests: [], pendingQuest: null },
            assets: { ...base.assets, ownedItems: [] },
        });
        const quest = await persistQuest(quests, {
            infos: {
                ...buildQuest().infos,
                type: 'hunt',
                markerLocation: world.questPoi,
                timeToComplete: 60000,
            },
        });
        return {
            ownerId: owner._id as Types.ObjectId,
            characterId: character._id as Types.ObjectId,
            questId: quest._id as Types.ObjectId,
        };
    }

    it('draws the ambush of the automatic travel before the claim (D-05)', async () => {
        const { ownerId, characterId, questId } = await ruinsQuestAtAlba();

        await acceptance.accept({ ownerId, characterId, questId });

        const active = (
            await connection.collection('characters').findOne({
                _id: characterId,
            })
        )?.status.activeTravel;
        expect(active.ambush.km).toBe(1);
        expect(queue.added.map(({ name }) => name)).toEqual([
            'complete',
            AMBUSH_JOB,
        ]);
        expect(queue.added[1].options.jobId).toBe(
            ambushJobId(characterId, ACCEPTED_AT, active.ambush.at),
        );
    });

    it('never draws on the quest travel preview (D-15)', async () => {
        const { characterId, questId } = await ruinsQuestAtAlba();

        expect(
            await acceptance.previewTravel(characterId, questId),
        ).not.toBeNull();
        expect(chance.drawn.length).toBe(0);
    });
});
