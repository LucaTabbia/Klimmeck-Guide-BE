import { Db, Document, MongoClient, ObjectId } from 'mongodb';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import { QUEST_LANES } from 'src/quests/acceptance/quest-lanes';
import { buildCharacter, buildQuest } from '../../../test/fixtures';
import { runFixes } from './fix-runner';

const DB_NAME = 'content-delete-quests-test';
const COLLECTIONS = [
    'quests',
    'pendingquests',
    'pointsofinterest',
    'characters',
    'questresults',
];

function deleteFix(ids: ObjectId[]): LoadedEntry {
    return {
        file: 'fixes/delete-test-quests.yaml',
        line: 1,
        raw: {
            key: 'delete-test-quests',
            kind: 'deleteQuests',
            ids: ids.map((id) => id.toHexString()),
        },
    };
}

describe('deleteQuests fix (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let questId: ObjectId;
    let pendingId: ObjectId;
    let characterId: ObjectId;
    let poiId: ObjectId;
    let aidId: ObjectId;

    async function snapshot(): Promise<Record<string, Document[]>> {
        const entries = await Promise.all(
            COLLECTIONS.map(
                async (name) =>
                    [
                        name,
                        await db
                            .collection(name)
                            .find()
                            .sort({ _id: 1 })
                            .toArray(),
                    ] as const,
            ),
        );
        return Object.fromEntries(entries);
    }

    async function exists(collection: string, _id: ObjectId) {
        return (await db.collection(collection).countDocuments({ _id })) > 0;
    }

    async function setCharacter(update: Document): Promise<void> {
        await db
            .collection('characters')
            .updateOne({ _id: characterId }, { $set: update });
    }

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(DB_NAME);
    });

    beforeEach(async () => {
        await db.dropDatabase();
        questId = new ObjectId();
        pendingId = new ObjectId();
        characterId = new ObjectId();
        poiId = new ObjectId();
        aidId = new ObjectId();
        await db.collection('quests').insertMany([
            {
                _id: questId,
                ...buildQuest({ concludedAt: null, rescue: null }),
            },
            {
                _id: aidId,
                ...buildQuest({ rescue: { failedQuest: questId } }),
            },
        ]);
        await db.collection('pendingquests').insertOne({
            _id: pendingId,
            startDate: null,
            arrivedAt: null,
            waitingTime: 0,
            pointsSpent: 0,
            quest: questId,
        });
        await db.collection('pointsofinterest').insertOne({
            _id: poiId,
            name: 'Radura',
            type: ['forest'],
            quest: questId,
        });
        await db
            .collection('characters')
            .insertOne({ _id: characterId, ...buildCharacter() });
        await db.collection('questresults').insertOne({
            quest: { id: questId, type: 'hunt', title: 'Test Quest' },
            outcome: 'success',
        });
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('deletes a free test quest with its stale pending quest and point back link (D-05)', async () => {
        const [report] = await runFixes(db, [deleteFix([questId])], 'apply');

        expect(report).toMatchObject({
            key: 'delete-test-quests',
            kind: 'deleteQuests',
            status: 'applied',
            touched: 3,
            deleted: [questId.toHexString()],
            pendingQuestsDeleted: 1,
            poiBackLinksCleared: 1,
            blocked: [],
        });
        expect(await exists('quests', questId)).toBe(false);
        expect(await exists('pendingquests', pendingId)).toBe(false);
        const poi = await db
            .collection('pointsofinterest')
            .findOne({ _id: poiId });
        expect(poi?.quest).toBeNull();
    });

    it.each(QUEST_LANES)(
        'blocks a quest whose pending quest occupies a character lane: %s (Pitfall 2)',
        async (lane) => {
            await setCharacter({ [`quests.${lane}`]: pendingId });
            const before = await snapshot();

            const [report] = await runFixes(
                db,
                [deleteFix([questId])],
                'apply',
            );

            expect(report).toMatchObject({
                status: 'blocked',
                touched: 0,
                deleted: [],
                blocked: [
                    {
                        questId: questId.toHexString(),
                        pendingQuest: pendingId.toHexString(),
                        character: characterId.toHexString(),
                        lane,
                    },
                ],
            });
            expect(await snapshot()).toEqual(before);
        },
    );

    it.each(['quest', 'aidQuest'] as const)(
        'blocks a quest a character awaits aid for: %s (Pitfall 2)',
        async (field) => {
            const other = new ObjectId();
            await setCharacter({
                'status.awaitingAid': {
                    quest: field === 'quest' ? questId : other,
                    aidQuest: field === 'aidQuest' ? questId : other,
                    since: new Date(),
                },
            });
            const before = await snapshot();

            const [report] = await runFixes(
                db,
                [deleteFix([questId])],
                'apply',
            );

            expect(report).toMatchObject({
                status: 'blocked',
                touched: 0,
                blocked: [
                    {
                        questId: questId.toHexString(),
                        pendingQuest: null,
                        character: characterId.toHexString(),
                        lane: 'awaitingAid',
                    },
                ],
            });
            expect(await snapshot()).toEqual(before);
        },
    );

    it('matches legacy string references when guarding the lanes (Pitfall 2)', async () => {
        await db
            .collection('pendingquests')
            .updateOne(
                { _id: pendingId },
                { $set: { quest: questId.toHexString() } },
            );
        await setCharacter({
            'quests.activeStoryQuest': pendingId.toHexString(),
        });

        const [report] = await runFixes(db, [deleteFix([questId])], 'apply');

        expect(report).toMatchObject({
            status: 'blocked',
            blocked: [
                {
                    questId: questId.toHexString(),
                    pendingQuest: pendingId.toHexString(),
                    lane: 'activeStoryQuest',
                },
            ],
        });
        expect(await exists('quests', questId)).toBe(true);
    });

    it('still deletes the free quests of a list with a blocked one', async () => {
        const freeId = new ObjectId();
        await db
            .collection('quests')
            .insertOne({ _id: freeId, ...buildQuest() });
        await setCharacter({ 'quests.pendingQuest': pendingId });

        const [report] = await runFixes(
            db,
            [deleteFix([questId, freeId])],
            'apply',
        );

        expect(report).toMatchObject({
            status: 'blocked',
            touched: 1,
            deleted: [freeId.toHexString()],
        });
        expect(await exists('quests', freeId)).toBe(false);
        expect(await exists('quests', questId)).toBe(true);
    });

    it('keeps the quest results that cite the deleted quest', async () => {
        const before = await db.collection('questresults').find().toArray();

        const [report] = await runFixes(db, [deleteFix([questId])], 'apply');

        expect(report.questResultsKept).toBe(1);
        expect(await db.collection('questresults').find().toArray()).toEqual(
            before,
        );
    });

    it('reports aid quests that point to a deleted quest', async () => {
        const [report] = await runFixes(db, [deleteFix([questId])], 'apply');

        expect(report.aidReferences).toEqual([aidId.toHexString()]);
        expect(await exists('quests', aidId)).toBe(true);
    });

    it('does not report an aid quest that is itself in the list', async () => {
        const [report] = await runFixes(
            db,
            [deleteFix([questId, aidId])],
            'apply',
        );

        expect(report.aidReferences).toEqual([]);
        expect(report.deleted).toEqual([
            questId.toHexString(),
            aidId.toHexString(),
        ]);
    });

    it('is done when every listed quest is already gone', async () => {
        await runFixes(db, [deleteFix([questId])], 'apply');

        const [again] = await runFixes(db, [deleteFix([questId])], 'apply');

        expect(again).toMatchObject({
            status: 'done',
            touched: 0,
            deleted: [],
            blocked: [],
        });
    });

    it.each(['dry-run', 'verify'] as const)(
        'only reports pending on dry-run and verify: %s',
        async (mode) => {
            const before = await snapshot();

            const [report] = await runFixes(db, [deleteFix([questId])], mode);

            expect(report).toMatchObject({
                status: 'pending',
                touched: 3,
                deleted: [questId.toHexString()],
                pendingQuestsDeleted: 1,
                poiBackLinksCleared: 1,
            });
            expect(await snapshot()).toEqual(before);
        },
    );
});
