import { Db, MongoClient, ObjectId } from 'mongodb';
import {
    ContentCollection,
    ContentTree,
} from 'src/content/loading/content-tree';
import {
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';
import { seedWorld } from '../../../test/content/seed-world';
import { pruneCollection } from './content-prune';
import { runContent } from './content-sync';

const DB_NAME = 'content-prune-test';

describe('pruneCollection (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let tree: ContentTree;

    const exists = async (collection: string, _id: ObjectId) =>
        (await db.collection(collection).countDocuments({ _id })) > 0;

    function openQuest(type: string, title: string) {
        return {
            _id: new ObjectId(),
            infos: { type, title },
            registeredAdventurers: [],
            concludedAt: null,
        };
    }

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(DB_NAME);
    });

    beforeEach(async () => {
        await db.dropDatabase();
        tree = loadTestContentTree();
        await seedWorld(db, tree.world ?? []);
        await runContent(db, 'apply', tree);
        tree = loadTestContentTree();
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('deletes only the orphans of the chosen collection (D-05)', async () => {
        const lore = new ObjectId();
        const spell = new ObjectId();
        await db
            .collection('lore')
            .insertOne({ _id: lore, type: 'knowledge', name: 'Lore Vecchia' });
        await db
            .collection('spells')
            .insertOne({ _id: spell, name: 'Magia Vecchia' });

        const report = await pruneCollection(db, 'lore', tree);

        expect(report).toEqual({
            mode: 'prune',
            collection: 'lore',
            deleted: [{ id: lore.toHexString(), name: 'Lore Vecchia' }],
            blocked: [],
            errors: [],
        });
        expect(await exists('lore', lore)).toBe(false);
        expect(await exists('spells', spell)).toBe(true);
        expect(await db.collection('lore').countDocuments()).toBe(3);
    });

    it('never prunes generated, aid, story, world mission or concluded quests (D-05)', async () => {
        const kept = [
            openQuest('enemy', 'Generata'),
            openQuest('aid', 'Soccorso'),
            openQuest('story', 'Storia'),
            openQuest('worldMission', 'Missione'),
            {
                ...openQuest('heal', 'Conclusa'),
                concludedAt: new Date('2026-10-01T10:00:00Z'),
            },
        ];
        const orphan = openQuest('job', 'Lavoro di prova');
        await db.collection('quests').insertMany([...kept, orphan]);

        const report = await pruneCollection(db, 'quests', tree);

        expect(report.deleted).toEqual([
            { id: orphan._id.toHexString(), name: 'Lavoro di prova' },
        ]);
        expect(await exists('quests', orphan._id)).toBe(false);
        for (const quest of kept) {
            expect(await exists('quests', quest._id)).toBe(true);
        }
        expect(await db.collection('quests').countDocuments()).toBe(
            2 + kept.length,
        );
    });

    it('clears the point of interest back link of a pruned quest (D-05)', async () => {
        const orphan = openQuest('job', 'Lavoro di prova');
        const poi = new ObjectId('64b0000000000000000000d5');
        await db.collection('quests').insertOne(orphan);
        await db
            .collection('pointsofinterest')
            .updateOne({ _id: poi }, { $set: { quest: orphan._id } });

        await pruneCollection(db, 'quests', tree);

        const stored = await db
            .collection('pointsofinterest')
            .findOne({ _id: poi });
        expect(stored?.quest).toBeNull();
    });

    it('blocks an orphan quest occupied by a character lane (Pitfall 2)', async () => {
        const orphan = openQuest('job', 'Lavoro occupato');
        const pending = new ObjectId();
        const character = new ObjectId();
        await db.collection('quests').insertOne(orphan);
        await db
            .collection('pendingquests')
            .insertOne({ _id: pending, quest: orphan._id });
        await db.collection('characters').insertOne({
            _id: character,
            quests: { pendingQuest: pending },
        });

        const report = await pruneCollection(db, 'quests', tree);

        expect(report.deleted).toEqual([]);
        expect(report.blocked).toEqual([
            {
                questId: orphan._id.toHexString(),
                pendingQuest: pending.toHexString(),
                character: character.toHexString(),
                lane: 'pendingQuest',
            },
        ]);
        expect(await exists('quests', orphan._id)).toBe(true);
        expect(await exists('pendingquests', pending)).toBe(true);
    });

    async function insertLore(name: string, type = 'knowledge') {
        const _id = new ObjectId();
        await db.collection('lore').insertOne({ _id, type, name });
        return _id;
    }

    it('refuses to prune when the snapshot is missing from the database (HI-01)', async () => {
        const lore = await insertLore('Lore Vecchia');
        await db
            .collection('cities')
            .deleteOne({ _id: new ObjectId('64b0000000000000000000c1') });

        const report = await pruneCollection(db, 'lore', tree);

        expect(report.errors).toEqual([
            expect.objectContaining({
                message: expect.stringContaining('assente dal database'),
            }),
        ]);
        expect(report.deleted).toEqual([]);
        expect(await exists('lore', lore)).toBe(true);
    });

    it('refuses to prune a probable id divergence (HI-01, Pitfall 7)', async () => {
        const twin = await insertLore('Regione di Prova', 'region');

        const report = await pruneCollection(db, 'lore', tree);

        expect(report.errors).toEqual([
            expect.objectContaining({
                entryId: twin.toHexString(),
                message: expect.stringContaining('divergenza'),
            }),
        ]);
        expect(report.deleted).toEqual([]);
        expect(await exists('lore', twin)).toBe(true);
    });

    it('refuses to prune a collection without entries in the files (HI-01)', async () => {
        tree.entries.quests = [];

        const report = await pruneCollection(db, 'quests', tree);

        expect(report.errors).toEqual([
            expect.objectContaining({
                message: expect.stringContaining('nessuna voce'),
            }),
        ]);
        expect(report.deleted).toEqual([]);
        expect(await db.collection('quests').countDocuments()).toBe(2);
    });

    it('refuses to prune more orphans than entries in the files (HI-01)', async () => {
        const orphans: ObjectId[] = [];
        for (const name of ['Prima', 'Seconda', 'Terza', 'Quarta']) {
            orphans.push(await insertLore(`Lore ${name}`));
        }

        const report = await pruneCollection(db, 'lore', tree);

        expect(report.errors).toEqual([
            expect.objectContaining({
                message: expect.stringContaining('4 orfani'),
            }),
        ]);
        expect(report.deleted).toEqual([]);
        for (const orphan of orphans) {
            expect(await exists('lore', orphan)).toBe(true);
        }
    });

    it('prunes nothing when the files are invalid', async () => {
        const lore = new ObjectId();
        await db
            .collection('lore')
            .insertOne({ _id: lore, type: 'knowledge', name: 'Lore Vecchia' });
        entryOf(tree, 'lore', '64b0000000000000000000a1').type = 'town';

        const report = await pruneCollection(db, 'lore', tree);

        expect(report.errors.length).toBeGreaterThan(0);
        expect(report.deleted).toEqual([]);
        expect(await exists('lore', lore)).toBe(true);
    });

    it('refuses the catalog collections without character guards (ME-04)', async () => {
        const spell = new ObjectId();
        await db
            .collection('spells')
            .insertOne({ _id: spell, name: 'Magia Vecchia' });

        const report = await pruneCollection(db, 'spells', tree);

        expect(report.errors).toEqual([
            expect.objectContaining({ path: 'collection' }),
        ]);
        expect(await exists('spells', spell)).toBe(true);
    });

    it('refuses a collection outside the managed ones (D-05)', async () => {
        const report = await pruneCollection(
            db,
            'cities' as ContentCollection,
            tree,
        );

        expect(report.errors).toEqual([
            expect.objectContaining({ path: 'collection' }),
        ]);
        expect(await db.collection('cities').countDocuments()).toBe(2);
    });
});
