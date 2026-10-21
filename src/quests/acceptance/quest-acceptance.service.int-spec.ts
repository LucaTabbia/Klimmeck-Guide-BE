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
import { RoadsService } from 'src/roads/roads.service';
import { TRAVEL_QUEUE, travelJobId } from 'src/travel/travel-job';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistCity,
    persistPoi,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    persistTravelWorld,
    TravelWorld,
} from '../../../test/travel/travel-world';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const ACCEPTED_AT = new Date('2026-03-04T05:06:07.000Z');
const STARTING_COINS = { gold: 1, silver: 2, copper: 3 };
// collection della mappa del viaggio: pre-create per le transazioni e svuotate dopo ogni test
const TRAVEL_COLLECTIONS = ['pets', 'pointsofinterest', 'roads'];

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

    async function characterAt(
        location: Types.ObjectId,
        title = 'rookie',
        questsState: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const base = buildCharacter();
        const character = await persistCharacter(characters, {
            infos: { ...base.infos, name: `Eroe ${seq++}` },
            status: {
                ...base.status,
                location,
                title,
                coins: STARTING_COINS,
            },
            quests: {
                completedQuests: [],
                pendingQuest: null,
                ...questsState,
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
                quests.collection.updateOne(
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
            expect(pending?.waitingTime).toBe(60000);
            expect(queue.added).toHaveLength(1);
            expect(queue.added[0].options).toMatchObject({
                jobId: travelJobId(charId, ACCEPTED_AT),
                delay: active.duration,
            });
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

        // marker nei pointsOfInterest della città ma senza documento POI (D-27): rifiuto prima della transazione, nessuna scrittura
        it('rejects a marker without a point of interest document with QUEST_NOT_ACCEPTABLE and writes nothing', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation();
            const transaction = jest.spyOn(connection, 'transaction');
            const ghost = new Types.ObjectId();
            await cities.collection.updateOne(
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
                quests.collection.updateOne(
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

        it('accepts a world mission from another city', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(await otherCityMarker());
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                requiredAdventurers: ANY_THREE,
            });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.activeWorldMissionQuest).toEqual(
                pqId,
            );
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
                { character: charId, title: 'hero' },
            ]);
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
                { character: chars[winner], title: 'adventurer' },
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
                { character: charId, title: 'rookie' },
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
            await quests.collection.updateOne(
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
                { character: hero, title: 'hero' },
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
                { character: charId, title: 'rookie' },
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
    });
});
