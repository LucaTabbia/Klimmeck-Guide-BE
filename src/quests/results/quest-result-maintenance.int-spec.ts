import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import {
    UNACKNOWLEDGED_RESULTS_LIMIT,
    UNACKNOWLEDGED_RESULTS_SORT,
    unacknowledgedResultsFilterOf,
} from 'src/quests/results/quest-result-acknowledgement';
import { QuestResultMaintenance } from 'src/quests/results/quest-result-maintenance';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    buildQuestResult,
    persistQuestResult,
} from '../../../test/quests/quest-result.fixture';

const T = new Date('2026-10-24T10:00:00.000Z');
const EARLIER = new Date('2026-10-20T08:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const UNACKNOWLEDGED_INDEX_KEY = {
    user: 1,
    acknowledgedAt: 1,
    resolvedAt: 1,
    _id: 1,
};

function hoursAfterT(hours: number): Date {
    return new Date(T.getTime() + hours * HOUR_MS);
}

function mongoFailure(): Error {
    return Object.assign(new Error('secret detail'), {
        name: 'MongoServerError',
        code: 85,
    });
}

describe('quest result maintenance (replSet)', () => {
    let harness: AuthTestApp;
    let maintenance: QuestResultMaintenance;
    let results: Model<QuestResultDocument>;

    async function insertLegacyResult(resolvedAt: Date) {
        const { insertedId } = await results.collection.insertOne(
            buildQuestResult({ resolvedAt }),
        );
        return insertedId;
    }

    async function rawResult(id: Types.ObjectId) {
        return results.collection.findOne({ _id: id });
    }

    function loggedErrors(error: jest.SpyInstance): string[] {
        return error.mock.calls.map(([message]) => String(message));
    }

    async function settleBootMaintenance(boot: jest.SpyInstance) {
        await Promise.all(boot.mock.results.map(({ value }) => value));
        boot.mockRestore();
    }

    beforeAll(async () => {
        const boot = jest.spyOn(QuestResultMaintenance.prototype, 'maintain');
        harness = await createAuthTestApp({ imports: [QuestResultsModule] });
        await settleBootMaintenance(boot);
        maintenance = harness.app.get(QuestResultMaintenance);
        results = harness.app.get<Model<QuestResultDocument>>(
            getModelToken(QuestResult.name),
        );
        await results.createCollection();
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('marks every legacy result as confirmed at its resolution time, once', async () => {
        const resolutions = [hoursAfterT(0), hoursAfterT(1), hoursAfterT(2)];
        const ids: Types.ObjectId[] = [];
        for (const resolvedAt of resolutions) {
            ids.push(await insertLegacyResult(resolvedAt));
        }

        await expect(maintenance.backfill()).resolves.toBe(3);
        await expect(maintenance.backfill()).resolves.toBe(0);

        for (const [index, id] of ids.entries()) {
            const stored = await rawResult(id);
            expect(stored?.acknowledgedAt).toEqual(resolutions[index]);
        }
    });

    it('leaves new unconfirmed results and confirmed ones untouched', async () => {
        const unconfirmed = await persistQuestResult(results);
        const confirmed = await persistQuestResult(results, {
            acknowledgedAt: EARLIER,
        });

        await expect(maintenance.backfill()).resolves.toBe(0);

        expect((await rawResult(unconfirmed._id))?.acknowledgedAt).toBeNull();
        expect((await rawResult(confirmed._id))?.acknowledgedAt).toEqual(
            EARLIER,
        );
    });

    it('builds the index of the unconfirmed list', async () => {
        await maintenance.verifyIndexes();

        const indexes = await results.collection.indexes();
        const index = indexes.find(
            ({ name }) => name === 'quest_result_unacknowledged',
        );

        expect(index?.key).toEqual(UNACKNOWLEDGED_INDEX_KEY);
    });

    it('serves the unconfirmed list from the index without an in-memory sort', async () => {
        await maintenance.verifyIndexes();
        const userId = new Types.ObjectId();
        for (const hours of [2, 0, 1]) {
            await persistQuestResult(results, {
                user: userId,
                resolvedAt: hoursAfterT(hours),
            });
        }
        await persistQuestResult(results);

        const plan = JSON.stringify(
            await results
                .find(unacknowledgedResultsFilterOf(userId))
                .sort(UNACKNOWLEDGED_RESULTS_SORT)
                .limit(UNACKNOWLEDGED_RESULTS_LIMIT)
                .explain(),
        );

        expect(plan).toContain('"IXSCAN"');
        expect(plan).toContain('"quest_result_unacknowledged"');
        expect(plan).not.toContain('"stage":"SORT"');
    });

    it('logs an index failure with name and code only and keeps booting', async () => {
        const legacyId = await insertLegacyResult(T);
        jest.spyOn(results, 'createIndexes').mockRejectedValue(mongoFailure());
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();

        await expect(maintenance.maintain()).resolves.toBeUndefined();

        const messages = loggedErrors(error);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('MongoServerError');
        expect(messages[0]).toContain('85');
        expect(messages[0]).not.toContain('secret detail');
        expect((await rawResult(legacyId))?.acknowledgedAt).toEqual(T);
    });

    it('logs a backfill failure with name and code only and keeps booting', async () => {
        jest.spyOn(results, 'updateMany').mockReturnValue({
            exec: () => Promise.reject(mongoFailure()),
        } as unknown as ReturnType<typeof results.updateMany>);
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();

        await expect(maintenance.maintain()).resolves.toBeUndefined();

        const messages = loggedErrors(error);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('MongoServerError');
        expect(messages[0]).toContain('85');
        expect(messages[0]).not.toContain('secret detail');
    });

    it('runs the backfill during the boot', async () => {
        const legacyId = await insertLegacyResult(T);
        const maintain = jest.spyOn(maintenance, 'maintain');

        maintenance.onApplicationBootstrap();
        await maintain.mock.results[0].value;

        expect((await rawResult(legacyId))?.acknowledgedAt).toEqual(T);
    });

    it('never makes the boot wait for the result maintenance (D-17b)', async () => {
        jest.spyOn(results, 'updateMany').mockReturnValue({
            exec: () => Promise.reject(mongoFailure()),
        } as unknown as ReturnType<typeof results.updateMany>);
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        const maintain = jest.spyOn(maintenance, 'maintain');

        expect(maintenance.onApplicationBootstrap()).toBeUndefined();

        expect(maintain).toHaveBeenCalledTimes(1);
        await expect(maintain.mock.results[0].value).resolves.toBeUndefined();
        const messages = loggedErrors(error);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('MongoServerError');
    });
});
