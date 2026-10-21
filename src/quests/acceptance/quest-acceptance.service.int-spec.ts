import { INestApplication, Logger } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistCity,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const STARTING_COINS = { gold: 1, silver: 2, copper: 3 };

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
    let world: World;
    let seq = 0;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'quest-acceptance-test',
                }),
                QuestAcceptanceModule,
            ],
        }).compile();
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
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            quests.init(),
            pendingQuests.init(),
            users.init(),
            cities.init(),
        ]);
    });

    beforeEach(async () => {
        world = await persistWorld();
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all([
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

    async function persistWorld(): Promise<World> {
        const cityMarker = new Types.ObjectId();
        const cityPoi = new Types.ObjectId();
        const questMarker = new Types.ObjectId();
        await persistCity(cities, {
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

    describe('lanes and points', () => {
        it('claims the story lane, records the paid points and debits the owner', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf(
                'story',
                { requiredPoints: 5000, minTitle: 'rookie' },
                { timeToComplete: 60000 },
            );
            const t0 = new Date();

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
            const startDate = pending?.startDate as Date;
            expect(startDate.getTime()).toBeGreaterThanOrEqual(t0.getTime());
            expect(startDate.getTime()).toBeLessThanOrEqual(Date.now());
            expect(await pointsOf(ownerId)).toBe(1000);
            expect(character?.status.coins).toEqual(STARTING_COINS);
        });

        it('claims the world mission lane and debits its own points', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
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

    describe('city of the marker', () => {
        it('accepts from a point of interest of the quest city', async () => {
            const ownerId = await ownerWith(0);
            const charId = await characterAt(world.cityPoi);
            const questId = await questOf('hunt');

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
        });

        it('rejects from another city with QUEST_NOT_IN_CITY and writes nothing', async () => {
            const otherMarker = new Types.ObjectId();
            await persistCity(cities, {
                markerLocation: otherMarker,
                pointsOfInterest: [otherMarker],
            });
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(otherMarker);
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_NOT_IN_CITY' });

            expect((await raw(charId))?.quests.activeStoryQuest).toBeNull();
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

    describe('shared quests', () => {
        it('registers the world mission adventurer by rank', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'hero');
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                party: [{ title: 'hero', count: 1 }],
            });

            await accept(ownerId, charId, questId);

            const quest = await rawQuest(questId);
            expect(quest?.registeredAdventurers).toEqual([
                charId.toHexString(),
            ]);
            expect(quest?.registrations).toEqual([
                { character: charId, title: 'hero' },
            ]);
        });

        it('lets one of two concurrent heroes take the only hero slot', async () => {
            const { owners, chars } = await heroesRacing(2, 'hero');
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                party: [{ title: 'hero', count: 1 }],
            });

            const results = await Promise.allSettled(
                chars.map((charId, i) => accept(owners[i], charId, questId)),
            );

            const winners = results.filter((r) => r.status === 'fulfilled');
            expect(winners).toHaveLength(1);
            const loserIndex = results.findIndex(
                (r) => r.status === 'rejected',
            );
            expect(codeOf(results[loserIndex])).toBe('QUEST_FULL');
            expect((await rawQuest(questId))?.registrations).toHaveLength(1);
            expect(await pendingCount()).toBe(1);
            const points = await Promise.all(owners.map((id) => pointsOf(id)));
            expect(points[0] + points[1]).toBe(12000 - 3000);
            expect(
                (await raw(chars[loserIndex]))?.quests.activeWorldMissionQuest,
            ).toBeNull();
        });

        it('rejects a paladin on a hero-only party with QUEST_FULL and writes nothing', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker, 'paladin');
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
                party: [{ title: 'hero', count: 1 }],
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'QUEST_FULL' });

            expect(
                (await raw(charId))?.quests.activeWorldMissionQuest,
            ).toBeNull();
            expect((await rawQuest(questId))?.registrations).toEqual([]);
            expect(await pendingCount()).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
        });

        it('fills a legacy world mission up to requiredAdventurers', async () => {
            const { owners, chars } = await heroesRacing(3, 'rookie');
            const questId = await questOf('worldMission', {
                requiredPoints: 1000,
                party: [],
                requiredAdventurers: 2,
            });

            const results = await Promise.allSettled(
                chars.map((charId, i) => accept(owners[i], charId, questId)),
            );

            expect(
                results.filter((r) => r.status === 'fulfilled'),
            ).toHaveLength(2);
            const losers = results.filter((r) => r.status === 'rejected');
            expect(losers.map(codeOf)).toEqual(['QUEST_FULL']);
            expect(
                (await rawQuest(questId))?.registeredAdventurers,
            ).toHaveLength(2);
            expect(await pendingCount()).toBe(2);
        });

        it('leaves no registration when the points are insufficient', async () => {
            const ownerId = await ownerWith(100);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('worldMission', {
                requiredPoints: 3000,
            });

            await expect(
                accept(ownerId, charId, questId),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });

            const quest = await rawQuest(questId);
            expect(quest?.registrations).toEqual([]);
            expect(quest?.registeredAdventurers).toEqual([]);
            expect(
                (await raw(charId))?.quests.activeWorldMissionQuest,
            ).toBeNull();
            expect(await pendingCount()).toBe(0);
        });

        it('registers a boss in the standard lane without any cost', async () => {
            const ownerId = await ownerWith(6000);
            const charId = await characterAt(world.cityMarker);
            const questId = await questOf('boss', {
                party: [{ title: 'rookie', count: 2 }],
                requiredPoints: 4000,
            });

            const pqId = await accept(ownerId, charId, questId);

            expect((await raw(charId))?.quests.pendingQuest).toEqual(pqId);
            expect((await pendingOf(pqId))?.pointsSpent).toBe(0);
            expect(await pointsOf(ownerId)).toBe(6000);
            expect((await rawQuest(questId))?.registeredAdventurers).toEqual([
                charId.toHexString(),
            ]);
        });

        it('never registers story adventurers', async () => {
            const questId = await questOf('story', {
                requiredPoints: 1000,
                minTitle: 'rookie',
                requiredAdventurers: 1,
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
