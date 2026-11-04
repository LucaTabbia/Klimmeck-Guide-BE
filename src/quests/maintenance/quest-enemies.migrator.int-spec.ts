import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    QuestResult,
    QuestResultDocument,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
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
import { buildQuestResult } from '../../../test/quests/quest-result.fixture';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';

describe('QuestEnemiesMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let results: Model<QuestResultDocument>;
    let migrator: QuestEnemiesMigrator;

    function legacyInfos(enemy: unknown): Record<string, unknown> {
        const { infos } = buildQuest();
        return { ...infos, enemy };
    }

    async function insertQuest(infos: Record<string, unknown>) {
        const { insertedId } = await quests.collection.insertOne({
            ...buildQuest(),
            infos,
        });
        return insertedId;
    }

    async function rawQuest(id: Types.ObjectId) {
        return quests.collection.findOne({ _id: id });
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: QuestResult.name, schema: QuestResultSchema },
                ]),
            ],
        });
        quests = harness.app.get<Model<QuestDocument>>(
            getModelToken(Quest.name),
        );
        results = harness.app.get<Model<QuestResultDocument>>(
            getModelToken(QuestResult.name),
        );
        migrator = new QuestEnemiesMigrator(quests as never, results as never);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('migrates a legacy quest enemy into a one-entry list and drops the old field (D-01)', async () => {
        const enemy = new Types.ObjectId();
        const id = await insertQuest(legacyInfos(enemy));

        await expect(migrator.migrateAll()).resolves.toEqual({
            quests: 1,
            results: 0,
        });

        const stored = await rawQuest(id);
        expect(stored?.infos.enemies).toEqual([{ enemy, quantity: 1 }]);
        expect(Object.keys(stored?.infos).sort()).toEqual(
            [
                'enemies',
                'markerLocation',
                'relatedLore',
                'timeToComplete',
                'title',
                'type',
            ].sort(),
        );
    });

    it('migrates a null or missing quest enemy into an empty list (D-28)', async () => {
        const nullEnemy = await insertQuest(legacyInfos(null));
        const { enemy: _dropped, ...withoutEnemy } = legacyInfos(null);
        const missingEnemy = await insertQuest(withoutEnemy);

        await expect(migrator.migrateAll()).resolves.toEqual({
            quests: 2,
            results: 0,
        });

        for (const id of [nullEnemy, missingEnemy]) {
            const stored = await rawQuest(id);
            expect(stored?.infos.enemies).toEqual([]);
            expect(Object.keys(stored?.infos)).not.toContain('enemy');
        }
    });

    it('leaves a quest that already has the list untouched (D-01)', async () => {
        const { enemy: _dropped, ...infos } = legacyInfos(null);
        const id = await insertQuest({
            ...infos,
            enemies: [{ enemy: new Types.ObjectId(), quantity: 3 }],
        });
        const before = await rawQuest(id);

        await expect(migrator.migrateAll()).resolves.toEqual({
            quests: 0,
            results: 0,
        });

        expect(await rawQuest(id)).toEqual(before);
    });

    it('migrates the quest results the same way at the root (D-01)', async () => {
        const enemy = new Types.ObjectId();
        const { insertedId: legacy } = await results.collection.insertOne(
            buildQuestResult({ enemy }),
        );
        const { insertedId: empty } = await results.collection.insertOne(
            buildQuestResult({ enemy: null }),
        );
        const { enemy: _dropped, ...migratedResult } = buildQuestResult({
            enemies: [{ enemy, quantity: 2 }],
        });
        const { insertedId: migrated } =
            await results.collection.insertOne(migratedResult);
        const untouched = await results.collection.findOne({ _id: migrated });

        await expect(migrator.migrateAll()).resolves.toEqual({
            quests: 0,
            results: 2,
        });

        const stored = await results.collection.findOne({ _id: legacy });
        expect(stored?.enemies).toEqual([{ enemy, quantity: 1 }]);
        expect(Object.keys(stored ?? {})).not.toContain('enemy');
        const storedEmpty = await results.collection.findOne({ _id: empty });
        expect(storedEmpty?.enemies).toEqual([]);
        expect(Object.keys(storedEmpty ?? {})).not.toContain('enemy');
        expect(await results.collection.findOne({ _id: migrated })).toEqual(
            untouched,
        );
    });

    it('modifies nothing on the second run (D-28)', async () => {
        await insertQuest(legacyInfos(new Types.ObjectId()));
        await insertQuest(legacyInfos(null));
        await results.collection.insertOne(
            buildQuestResult({ enemy: new Types.ObjectId() }),
        );

        await expect(migrator.migrateAll()).resolves.toEqual({
            quests: 2,
            results: 1,
        });
        await expect(migrator.migrateAll()).resolves.toEqual({
            quests: 0,
            results: 0,
        });
    });
});
