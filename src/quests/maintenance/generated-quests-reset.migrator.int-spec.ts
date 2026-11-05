import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { GeneratedQuestsResetMigrator } from './generated-quests-reset.migrator';

describe('GeneratedQuestsResetMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let migrator: GeneratedQuestsResetMigrator;
    let logSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    async function insertQuest(
        options: {
            generated?: boolean;
            minTitle?: string;
            concludedAt?: Date | null;
            registered?: boolean;
        } = {},
    ): Promise<Types.ObjectId> {
        const quest = buildQuest();
        const { insertedId } = await quests.collection.insertOne({
            ...quest,
            generated: options.generated ?? true,
            concludedAt: options.concludedAt ?? null,
            requirements: {
                ...quest.requirements,
                minTitle: options.minTitle ?? 'rookie',
            },
            registeredAdventurers: options.registered
                ? [{ character: new Types.ObjectId(), title: 'legend' }]
                : [],
        });
        return insertedId;
    }

    async function holdInLane(quest: Types.ObjectId | string): Promise<void> {
        await pendingQuests.collection.insertOne({
            startDate: null,
            arrivedAt: null,
            waitingTime: 0,
            pointsSpent: 0,
            quest,
        });
    }

    async function remainingIds(): Promise<string[]> {
        const left = await quests.collection
            .find({}, { projection: { _id: 1 } })
            .toArray();
        return left.map((quest) => quest._id.toHexString()).sort();
    }

    const sorted = (ids: Types.ObjectId[]): string[] =>
        ids.map((id) => id.toHexString()).sort();

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: PendingQuest.name, schema: PendingQuestSchema },
                ]),
            ],
        });
        quests = harness.app.get<Model<QuestDocument>>(
            getModelToken(Quest.name),
        );
        pendingQuests = harness.app.get<Model<PendingQuestDocument>>(
            getModelToken(PendingQuest.name),
        );
        migrator = new GeneratedQuestsResetMigrator(
            quests as never,
            pendingQuests as never,
        );
    });

    beforeEach(() => {
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        debugSpy = jest
            .spyOn(Logger.prototype, 'debug')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('deletes the open generated quests when a legend one is left (D-06)', async () => {
        await insertQuest({ minTitle: 'legend' });
        await insertQuest({ minTitle: 'hero' });
        await insertQuest({ minTitle: 'rookie' });
        const concluded = await insertQuest({
            minTitle: 'legend',
            concludedAt: new Date('2026-11-01T00:00:00Z'),
        });
        const fixed = await insertQuest({ generated: false });
        await holdInLane(fixed);

        await expect(migrator.migrate()).resolves.toEqual({
            deleted: 3,
            kept: 0,
        });

        expect(await remainingIds()).toEqual(sorted([concluded, fixed]));
        expect(logSpy.mock.calls).toEqual([
            ['Generate: 3 cancellate, 0 lasciate'],
        ]);
        expect(debugSpy).not.toHaveBeenCalled();
    });

    it('keeps a generated quest with registered adventurers or in a lane and lists only those at debug (D-06)', async () => {
        const registered = await insertQuest({
            minTitle: 'legend',
            registered: true,
        });
        const inLane = await insertQuest({ minTitle: 'hero' });
        await holdInLane(inLane.toHexString());
        await insertQuest({ minTitle: 'legend' });
        await insertQuest({ minTitle: 'paladin' });
        const fixed = await insertQuest({ generated: false });
        await holdInLane(fixed);
        await holdInLane(new Types.ObjectId());

        await expect(migrator.migrate()).resolves.toEqual({
            deleted: 2,
            kept: 2,
        });

        expect(await remainingIds()).toEqual(
            sorted([registered, inLane, fixed]),
        );
        expect(logSpy.mock.calls).toEqual([
            ['Generate: 2 cancellate, 2 lasciate'],
        ]);
        expect(debugSpy.mock.calls).toEqual([
            [`Generate protette: ${sorted([registered, inLane]).join(', ')}`],
        ]);
    });

    it('does nothing without an unprotected legend generated quest (D-06)', async () => {
        await insertQuest({ minTitle: 'hero' });
        await insertQuest({ minTitle: 'rookie' });

        await expect(migrator.migrate()).resolves.toEqual({
            deleted: 0,
            kept: 0,
        });

        expect(await quests.countDocuments()).toBe(2);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('writes nothing on the second run even with a protected legend quest left (D-06)', async () => {
        await insertQuest({ minTitle: 'legend', registered: true });
        const inLane = await insertQuest({ minTitle: 'hero' });
        await holdInLane(inLane);
        await insertQuest({ minTitle: 'legend' });
        await migrator.migrate();
        await insertQuest({ minTitle: 'rookie' });
        const before = await remainingIds();
        logSpy.mockClear();

        await expect(migrator.migrate()).resolves.toEqual({
            deleted: 0,
            kept: 0,
        });

        expect(await remainingIds()).toEqual(before);
        expect(logSpy).not.toHaveBeenCalled();
    });
});
