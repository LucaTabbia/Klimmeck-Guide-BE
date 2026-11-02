import { Collection, Db, Double, MongoClient, ObjectId } from 'mongodb';
import {
    CONTENT_COLLECTIONS,
    ContentTree,
} from 'src/content/loading/content-tree';
import {
    addEntry,
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';
import { seedWorld } from '../../../test/content/seed-world';
import { hasDrift } from './content-report';
import { runContent } from './content-sync';
import { DATABASE_SOURCE } from './db-checks';

const DB_NAME = 'content-sync-test';
const CITY_ONE = new ObjectId('64b0000000000000000000c1');
const CITY_TWO = new ObjectId('64b0000000000000000000c2');
const CITY_LORE = new ObjectId('64b0000000000000000000a2');
const DUNGEON_POI = new ObjectId('64b0000000000000000000d3');
const SPELL = new ObjectId('64b0000000000000000000b1');
const HEAL_QUEST = new ObjectId('64b000000000000000000301');

type Race = () => Promise<void>;

function bound(target: object, key: string | symbol): unknown {
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
}

// una scrittura concorrente fra il piano e il bulkWrite di una collezione
function racingDb(db: Db, name: string, race: Race): Db {
    const racingCollection = (collection: Collection) =>
        new Proxy(collection, {
            get: (target, key) => {
                if (key !== 'bulkWrite') return bound(target, key);
                return async (...args: Parameters<Collection['bulkWrite']>) => {
                    await race();
                    return target.bulkWrite(...args);
                };
            },
        });
    return new Proxy(db, {
        get: (target, key) => {
            if (key !== 'collection') return bound(target, key);
            return (collectionName: string) => {
                const collection = target.collection(collectionName);
                return collectionName === name
                    ? racingCollection(collection)
                    : collection;
            };
        },
    });
}

describe('runContent (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let tree: ContentTree;

    async function countsOf(): Promise<Record<string, number>> {
        const counts = await Promise.all(
            CONTENT_COLLECTIONS.map(
                async (name) =>
                    [name, await db.collection(name).countDocuments()] as const,
            ),
        );
        return Object.fromEntries(counts);
    }

    const noDocuments = Object.fromEntries(
        CONTENT_COLLECTIONS.map((name) => [name, 0]),
    );

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
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('previews inserts without writing on dry-run (D-27)', async () => {
        const report = await runContent(db, 'dry-run', tree);

        expect(report.errors).toEqual([]);
        expect(report.collections.lore.inserted).toBe(3);
        expect(report.collections.quests.inserted).toBe(2);
        expect(report.cities.relatedLore.modified).toBe(1);
        expect(await countsOf()).toEqual(noDocuments);
        expect(
            await db.collection('cities').findOne({ _id: CITY_ONE }),
        ).toEqual(
            expect.objectContaining({
                relatedLore: null,
                name: 'Borgo di Prova',
            }),
        );
    });

    it('inserts on apply, then verify finds no drift and a second apply modifies nothing (D-01)', async () => {
        const first = await runContent(db, 'apply', tree);
        expect(first.errors).toEqual([]);
        expect(
            first.warnings.filter(({ file }) => file === DATABASE_SOURCE),
        ).toEqual([]);
        expect(first.collections.lore.inserted).toBe(3);
        expect(first.collections.enemies.inserted).toBe(2);
        expect(await countsOf()).toEqual({
            lore: 3,
            spells: 1,
            equipmentitems: 1,
            lootitems: 1,
            enemies: 2,
            pets: 1,
            quests: 2,
        });

        const verify = await runContent(db, 'verify', loadTestContentTree());
        expect(hasDrift(verify)).toBe(false);

        const second = await runContent(db, 'apply', loadTestContentTree());
        for (const collection of CONTENT_COLLECTIONS) {
            expect(second.collections[collection]).toEqual(
                expect.objectContaining({ inserted: 0, modified: 0 }),
            );
        }
        expect(second.cities.relatedLore).toEqual({
            modified: 0,
            unchanged: 1,
            missing: [],
        });
    });

    it('warns when the bulk write outcome differs from the plan (LO-04)', async () => {
        const racedLore = new ObjectId('64b0000000000000000000a1');
        const racing = racingDb(db, 'lore', async () => {
            await db
                .collection('lore')
                .insertOne({ _id: racedLore, name: 'Scritta nel frattempo' });
        });

        const report = await runContent(racing, 'apply', tree);

        expect(report.errors).toEqual([]);
        expect(report.collections.lore).toEqual(
            expect.objectContaining({ inserted: 3, modified: 0 }),
        );
        expect(
            report.warnings.filter(({ file }) => file === DATABASE_SOURCE),
        ).toEqual([
            expect.objectContaining({
                path: 'lore',
                message:
                    'esito della scrittura diverso dal piano: inseriti 2 (piano 3), modificati 1 (piano 0)',
            }),
        ]);
    });

    it('rewrites a mongosh double once, then leaves it alone (Pitfall 3)', async () => {
        await runContent(db, 'apply', tree);
        await db
            .collection('spells')
            .updateOne(
                { _id: SPELL },
                { $set: { 'energyDamage.power': new Double(300) } },
            );

        const first = await runContent(db, 'apply', loadTestContentTree());
        expect(first.collections.spells.modified).toBe(1);

        const second = await runContent(db, 'apply', loadTestContentTree());
        expect(second.collections.spells.modified).toBe(0);
        expect(second.collections.spells.unchanged).toBe(1);
    });

    it('keeps the runtime fields of a fixed quest (Pattern 3)', async () => {
        const adventurer = new ObjectId();
        const startedAt = new Date('2026-10-01T10:00:00Z');
        await db.collection('quests').insertOne({
            _id: HEAL_QUEST,
            infos: { title: 'Vecchio titolo', type: 'heal' },
            registeredAdventurers: [adventurer],
            concludedAt: null,
            startedAt,
            rescue: null,
        });

        const report = await runContent(db, 'apply', tree);

        expect(report.collections.quests).toEqual(
            expect.objectContaining({ inserted: 1, modified: 1 }),
        );
        const quest = await db
            .collection('quests')
            .findOne({ _id: HEAL_QUEST });
        expect(quest?.infos.title).toBe('Cure al tempio del Borgo di Prova');
        expect(quest?.registeredAdventurers).toEqual([adventurer]);
        expect(quest?.startedAt).toEqual(startedAt);
    });

    it('starts a new fixed quest with empty runtime fields', async () => {
        await runContent(db, 'apply', tree);

        const quest = await db
            .collection('quests')
            .findOne({ _id: HEAL_QUEST });
        expect(quest).toEqual(
            expect.objectContaining({
                registeredAdventurers: [],
                concludedAt: null,
                startedAt: null,
                rescue: null,
            }),
        );
    });

    it('links the city to its lore without touching its geography (D-23)', async () => {
        await db
            .collection('cities')
            .updateOne({ _id: CITY_ONE }, { $set: { area: [[9.1, 45.4]] } });
        const before = await db.collection('cities').findOne({ _id: CITY_ONE });

        await runContent(db, 'apply', tree);

        const after = await db.collection('cities').findOne({ _id: CITY_ONE });
        expect(after?.relatedLore).toEqual(CITY_LORE);
        expect(after?.area).toEqual(before?.area);
        expect(after?.pointsOfInterest).toEqual(before?.pointsOfInterest);
        expect(after?.markerLocation).toEqual(before?.markerLocation);
    });

    it('writes nothing when a file is invalid (D-28)', async () => {
        entryOf(tree, 'lore', '64b0000000000000000000a1').type = 'town';

        const report = await runContent(db, 'apply', tree);

        expect(report.errors.length).toBeGreaterThan(0);
        expect(report.collections.lore.errors).toBeGreaterThan(0);
        expect(report.fixes).toEqual([]);
        expect(await countsOf()).toEqual(noDocuments);
        const city = await db.collection('cities').findOne({ _id: CITY_TWO });
        expect(city?.name).toBe('Capitale di Prova');
    });

    it('fails before writing when a snapshot city is missing from the database', async () => {
        await db.collection('cities').deleteOne({ _id: CITY_TWO });

        const report = await runContent(db, 'apply', tree);

        expect(report.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    file: 'world/cities.yaml',
                    entryId: CITY_TWO.toHexString(),
                }),
            ]),
        );
        expect(await countsOf()).toEqual(noDocuments);
        const city = await db.collection('cities').findOne({ _id: CITY_ONE });
        expect(city?.relatedLore).toBeNull();
    });

    it('fails before writing when a snapshot point of interest is missing', async () => {
        await db.collection('pointsofinterest').deleteOne({ _id: DUNGEON_POI });

        const report = await runContent(db, 'apply', tree);

        expect(report.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ entryId: DUNGEON_POI.toHexString() }),
            ]),
        );
        expect(await countsOf()).toEqual(noDocuments);
    });

    it('warns when a snapshot city has another name in the database', async () => {
        await db
            .collection('cities')
            .updateOne({ _id: CITY_ONE }, { $set: { name: 'Borgo Nuovo' } });

        const report = await runContent(db, 'dry-run', tree);

        expect(report.errors).toEqual([]);
        expect(report.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entryId: CITY_ONE.toHexString(),
                    message: expect.stringContaining('snapshot non allineato'),
                }),
            ]),
        );
    });

    it('lists orphans without deleting them on apply (D-05)', async () => {
        const orphan = new ObjectId();
        await db.collection('lore').insertOne({
            _id: orphan,
            type: 'knowledge',
            name: 'Lore Vecchia',
        });

        const report = await runContent(db, 'apply', tree);

        expect(report.collections.lore.orphans).toEqual([
            { id: orphan.toHexString(), name: 'Lore Vecchia' },
        ]);
        expect(
            await db.collection('lore').countDocuments({ _id: orphan }),
        ).toBe(1);
    });

    it('limits quest orphans to open fixed quests (D-05)', async () => {
        const open = new ObjectId();
        await db.collection('quests').insertMany([
            {
                _id: new ObjectId(),
                infos: { type: 'aid', title: 'Soccorso' },
                concludedAt: null,
            },
            {
                _id: new ObjectId(),
                infos: { type: 'enemy', title: 'Generata' },
                concludedAt: null,
            },
            {
                _id: new ObjectId(),
                infos: { type: 'story', title: 'Storia' },
                concludedAt: null,
            },
            {
                _id: new ObjectId(),
                infos: { type: 'heal', title: 'Conclusa' },
                concludedAt: new Date('2026-10-01T10:00:00Z'),
            },
            {
                _id: open,
                infos: { type: 'job', title: 'Lavoro di prova' },
                concludedAt: null,
            },
        ]);

        const report = await runContent(db, 'dry-run', tree);

        expect(report.collections.quests.orphans).toEqual([
            { id: open.toHexString(), name: 'Lavoro di prova' },
        ]);
    });

    it('warns about a probable id divergence (Pitfall 7)', async () => {
        const twin = new ObjectId();
        await db
            .collection('lore')
            .insertOne({ _id: twin, type: 'region', name: 'Regione di Prova' });

        const report = await runContent(db, 'verify', tree);

        expect(report.probableIdDivergence).toEqual([
            {
                collection: 'lore',
                id: twin.toHexString(),
                name: 'Regione di Prova',
                type: 'region',
            },
        ]);
    });

    it('reports out of enum point of interest types as errors on verify (Pitfall 5)', async () => {
        await db
            .collection('pointsofinterest')
            .updateOne(
                { _id: DUNGEON_POI },
                { $set: { type: ['dungeon', 'vulcano '] } },
            );

        const verify = await runContent(db, 'verify', tree);
        const dryRun = await runContent(db, 'dry-run', loadTestContentTree());

        const outOfEnum = expect.arrayContaining([
            expect.objectContaining({
                entryId: DUNGEON_POI.toHexString(),
                path: 'pointsofinterest.type',
            }),
        ]);
        expect(verify.errors).toEqual(outOfEnum);
        expect(dryRun.errors).toEqual([]);
        expect(dryRun.warnings).toEqual(outOfEnum);
    });

    it('runs the fixes after the content on apply', async () => {
        const first = await runContent(db, 'apply', tree);
        const renameOf = (fixes: typeof first.fixes) =>
            fixes.find((fix) => fix.kind === 'renameCity')?.status;
        expect(renameOf(first.fixes)).toBe('applied');
        expect(
            (await db.collection('cities').findOne({ _id: CITY_TWO }))?.name,
        ).toBe('Capitale Rinominata');

        const second = await runContent(db, 'apply', loadTestContentTree());
        expect(renameOf(second.fixes)).toBe('done');
        expect(second.fixes.every((fix) => fix.status === 'done')).toBe(true);
    });

    it('counts the documents a fix touches in its collection', async () => {
        await runContent(db, 'apply', tree);
        await db
            .collection('lore')
            .updateMany({}, { $set: { unlocked: true } });

        const report = await runContent(db, 'dry-run', loadTestContentTree());

        expect(report.collections.lore.fixes).toBe(3);
    });

    it('reports an added entry as an insert on verify', async () => {
        await runContent(db, 'apply', tree);
        const next = loadTestContentTree();
        addEntry(next, 'lore', {
            id: '64b0000000000000000000a9',
            type: 'knowledge',
            name: 'Sapere di Prova',
            description: 'Un sapere antico.',
        });

        const report = await runContent(db, 'verify', next);

        expect(report.collections.lore).toEqual(
            expect.objectContaining({ inserted: 1, modified: 0, unchanged: 3 }),
        );
        expect(hasDrift(report)).toBe(true);
    });
});
