import { INestApplication } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistQuest,
} from '../../../test/fixtures';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');

describe('QuestAcceptanceService (replSet)', () => {
    let app: INestApplication;
    let acceptance: QuestAcceptanceService;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;

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
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([
            characters.init(),
            quests.init(),
            pendingQuests.init(),
        ]);
    });

    afterEach(async () => {
        await Promise.all([
            characters.deleteMany({}),
            quests.deleteMany({}),
            pendingQuests.deleteMany({}),
        ]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    async function characterWith(
        coins: CoinPurse,
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const character = await persistCharacter(characters, {
            status: { ...buildCharacter().status, coins },
            ...overrides,
        });
        return character._id as Types.ObjectId;
    }

    async function questTaking(
        timeToComplete: number | null,
    ): Promise<Types.ObjectId> {
        const quest = await persistQuest(quests, {
            infos: { ...buildQuest().infos, timeToComplete },
        });
        return quest._id as Types.ObjectId;
    }

    async function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function pendingCount(): Promise<number> {
        return pendingQuests.countDocuments();
    }

    describe('successful acceptance', () => {
        it('claims the slot, inserts the pending quest and debits the cost', async () => {
            const charId = await characterWith({
                gold: 0,
                silver: 1,
                copper: 0,
            });
            const questId = await questTaking(60000);
            const t0 = new Date();

            const pqId = await acceptance.accept(charId, questId, 30);

            expect(pqId).toBeInstanceOf(Types.ObjectId);
            const raw = await rawCharacter(charId);
            expect(raw?.quests.pendingQuest).toEqual(pqId);
            expect(
                await characters.collection.countDocuments({
                    _id: charId,
                    'quests.pendingQuest': { $type: 'objectId' },
                }),
            ).toBe(1);
            expect(raw?.status.coins).toEqual({
                gold: 0,
                silver: 0,
                copper: 70,
            });
            const pending = await pendingQuests.collection.findOne({
                _id: pqId,
            });
            expect(pending?.quest).toEqual(questId);
            expect(pending?.waitingTime).toBe(60000);
            const startDate = pending?.startDate as Date;
            expect(startDate.getTime()).toBeGreaterThanOrEqual(t0.getTime());
            expect(startDate.getTime()).toBeLessThanOrEqual(Date.now());
            expect(await pendingCount()).toBe(1);
        });

        it('uses a zero waiting time when the quest has no timeToComplete', async () => {
            const charId = await characterWith({
                gold: 0,
                silver: 1,
                copper: 0,
            });
            const questId = await questTaking(null);

            const pqId = await acceptance.accept(charId, questId, 30);

            const pending = await pendingQuests.collection.findOne({
                _id: pqId,
            });
            expect(pending?.waitingTime).toBe(0);
        });

        it('accepts a free quest without touching the purse', async () => {
            const coins = { gold: 0, silver: 0, copper: 5 };
            const charId = await characterWith(coins);
            const questId = await questTaking(1000);

            const pqId = await acceptance.accept(charId, questId, 0);

            const raw = await rawCharacter(charId);
            expect(raw?.status.coins).toEqual(coins);
            expect(raw?.quests.pendingQuest).toEqual(pqId);
        });
    });

    describe('rejections', () => {
        it('answers QUEST_SLOT_BUSY when a quest is already pending and writes nothing', async () => {
            const coins = { gold: 0, silver: 1, copper: 0 };
            const busySlot = new Types.ObjectId();
            const charId = await characterWith(coins, {
                quests: { completedQuests: [], pendingQuest: busySlot },
            });
            const questId = await questTaking(1000);

            await expect(
                acceptance.accept(charId, questId, 30),
            ).rejects.toMatchObject({ code: 'QUEST_SLOT_BUSY' });

            const raw = await rawCharacter(charId);
            expect(await pendingCount()).toBe(0);
            expect(raw?.status.coins).toEqual(coins);
            expect(raw?.quests.pendingQuest).toEqual(busySlot);
        });

        it('answers INSUFFICIENT_FUNDS, releases the slot and leaves no pending quest', async () => {
            const coins = { gold: 0, silver: 0, copper: 10 };
            const charId = await characterWith(coins);
            const questId = await questTaking(1000);

            await expect(
                acceptance.accept(charId, questId, 30),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

            const raw = await rawCharacter(charId);
            expect(raw?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
            expect(raw?.status.coins).toEqual(coins);
        });

        it('answers NOT_FOUND for an unknown quest and writes nothing', async () => {
            const charId = await characterWith({
                gold: 0,
                silver: 1,
                copper: 0,
            });

            await expect(
                acceptance.accept(charId, new Types.ObjectId(), 30),
            ).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: 'Missione non trovata',
            });

            const raw = await rawCharacter(charId);
            expect(raw?.quests.pendingQuest).toBeNull();
            expect(await pendingCount()).toBe(0);
        });

        it('answers NOT_FOUND for a missing or archived character', async () => {
            const questId = await questTaking(1000);
            const archivedId = await characterWith(
                { gold: 0, silver: 1, copper: 0 },
                { deletedAt: ARCHIVED_AT, deletionReason: 'user_request' },
            );

            await expect(
                acceptance.accept(new Types.ObjectId(), questId, 30),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(
                acceptance.accept(archivedId, questId, 30),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });

            expect(await pendingCount()).toBe(0);
            const raw = await rawCharacter(archivedId);
            expect(raw?.quests.pendingQuest).toBeNull();
        });

        it.each([-1, 1.5])(
            'rejects a cost of %p with a RangeError before any write',
            async (cost) => {
                const charId = await characterWith({
                    gold: 0,
                    silver: 1,
                    copper: 0,
                });
                const questId = await questTaking(1000);

                await expect(
                    acceptance.accept(charId, questId, cost),
                ).rejects.toBeInstanceOf(RangeError);

                expect(await pendingCount()).toBe(0);
                const raw = await rawCharacter(charId);
                expect(raw?.quests.pendingQuest).toBeNull();
            },
        );
    });

    describe('concurrency (SC3)', () => {
        it('lets exactly one of concurrent accepts win', async () => {
            const charId = await characterWith({
                gold: 0,
                silver: 1,
                copper: 0,
            });
            const questId = await questTaking(1000);

            const results = await Promise.allSettled([
                acceptance.accept(charId, questId, 30),
                acceptance.accept(charId, questId, 30),
                acceptance.accept(charId, questId, 30),
            ]);

            const fulfilled = results.filter(
                (r): r is PromiseFulfilledResult<Types.ObjectId> =>
                    r.status === 'fulfilled',
            );
            const rejected = results.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected',
            );
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(2);
            for (const loser of rejected) {
                expect((loser.reason as { code?: string }).code).toBe(
                    'QUEST_SLOT_BUSY',
                );
            }
            expect(await pendingCount()).toBe(1);
            const raw = await rawCharacter(charId);
            expect(raw?.status.coins).toEqual({
                gold: 0,
                silver: 0,
                copper: 70,
            });
            expect(raw?.quests.pendingQuest).toEqual(fulfilled[0].value);
        });
    });
});
