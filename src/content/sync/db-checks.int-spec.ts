import { Db, MongoClient, ObjectId } from 'mongodb';
import { ContentTree } from 'src/content/loading/content-tree';
import { loadTestContentTree } from '../../../test/fixtures/content-tree.fixture';
import { seedWorld } from '../../../test/content/seed-world';
import { checkDatabase } from './db-checks';

const DB_NAME = 'content-db-checks-test';
const VILLAGE = new ObjectId('64b0000000000000000000c1');
const CAPITAL = new ObjectId('64b0000000000000000000c2');
const VILLAGE_MARKER = new ObjectId('64b0000000000000000000d1');
const FOREST_POI = new ObjectId('64b0000000000000000000d2');
const DUNGEON_POI = new ObjectId('64b0000000000000000000d3');
const CAPITAL_MARKER = new ObjectId('64b0000000000000000000d4');

describe('checkDatabase snapshot alignment (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let tree: ContentTree;

    async function snapshotErrors() {
        return (await checkDatabase(db, tree, 'dry-run')).errors.map(
            ({ entryId, path, message }) => ({ entryId, path, message }),
        );
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
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('accepts the points of interest of a city in any order (ME-03)', async () => {
        await db.collection('cities').updateOne(
            { _id: VILLAGE },
            {
                $set: {
                    pointsOfInterest: [DUNGEON_POI, VILLAGE_MARKER, FOREST_POI],
                },
            },
        );

        expect(await snapshotErrors()).toEqual([]);
    });

    it('rejects a city marker moved in the database (ME-03)', async () => {
        await db
            .collection('cities')
            .updateOne(
                { _id: VILLAGE },
                { $set: { markerLocation: FOREST_POI } },
            );

        expect(await snapshotErrors()).toEqual([
            {
                entryId: VILLAGE.toHexString(),
                path: 'markerLocation',
                message: expect.stringContaining('snapshot non allineato'),
            },
        ]);
    });

    it('rejects a point of interest moved to another city (ME-03)', async () => {
        await db
            .collection('cities')
            .updateOne(
                { _id: VILLAGE },
                { $set: { pointsOfInterest: [VILLAGE_MARKER, DUNGEON_POI] } },
            );
        await db.collection('cities').updateOne(
            { _id: CAPITAL },
            {
                $set: {
                    pointsOfInterest: [
                        CAPITAL_MARKER,
                        new ObjectId('64b0000000000000000000d5'),
                        FOREST_POI,
                    ],
                },
            },
        );
        await db
            .collection('pointsofinterest')
            .updateOne({ _id: FOREST_POI }, { $set: { city: CAPITAL } });

        expect(await snapshotErrors()).toEqual([
            {
                entryId: VILLAGE.toHexString(),
                path: 'pointsOfInterest',
                message: expect.stringContaining('snapshot non allineato'),
            },
            {
                entryId: FOREST_POI.toHexString(),
                path: 'pointsOfInterest.city',
                message: expect.stringContaining('snapshot non allineato'),
            },
            {
                entryId: CAPITAL.toHexString(),
                path: 'pointsOfInterest',
                message: expect.stringContaining('snapshot non allineato'),
            },
        ]);
    });

    it('accepts a legacy string reference to the same point of interest (ME-03)', async () => {
        await db
            .collection('cities')
            .updateOne(
                { _id: CAPITAL },
                { $set: { markerLocation: CAPITAL_MARKER.toHexString() } },
            );

        expect(await snapshotErrors()).toEqual([]);
    });
});
