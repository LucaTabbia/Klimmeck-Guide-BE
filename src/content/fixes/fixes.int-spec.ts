import { Db, Document, MongoClient, ObjectId } from 'mongodb';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import { runFixes } from './fix-runner';

const DB_NAME = 'content-fixes-test';
const REPAIRS = { NULLbelleholmIsland: 'belleholmIsland', gounet: 'glounet' };

function fixOf(raw: Record<string, unknown>): LoadedEntry {
    return { file: 'fixes/prova.yaml', line: 1, raw };
}

function poiFix(target: ObjectId): LoadedEntry {
    return fixOf({
        key: `poi-type-${target.toHexString()}`,
        kind: 'normalizePoiTypes',
        target: target.toHexString(),
        replacements: REPAIRS,
    });
}

function renameFix(target: ObjectId): LoadedEntry {
    return fixOf({
        key: 'rename-flinas',
        kind: 'renameCity',
        target: target.toHexString(),
        from: 'Flinas',
        to: 'Kliever',
    });
}

const LORE_FIX = fixOf({
    key: 'lore-unset-unlocked',
    kind: 'unsetLoreUnlocked',
});

describe('runFixes (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    const poiId = new ObjectId();
    const cityId = new ObjectId();

    async function snapshot(): Promise<Record<string, Document[]>> {
        const names = ['pointsofinterest', 'cities', 'lore'];
        const entries = await Promise.all(
            names.map(
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

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(DB_NAME);
    });

    beforeEach(async () => {
        await db.dropDatabase();
        await db.collection('pointsofinterest').insertOne({
            _id: poiId,
            name: 'Scogliera',
            type: ['NULLbelleholmIsland', 'belleholmIsland', 'forest'],
        });
        await db
            .collection('cities')
            .insertOne({ _id: cityId, name: 'Flinas', type: 'northVillage' });
        await db
            .collection('lore')
            .insertMany([
                { name: 'Regione', unlocked: true },
                { name: 'Città', unlocked: false },
                { name: 'Animale' },
            ]);
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('reports a dirty point of interest as pending without writing on dry-run (D-06)', async () => {
        const before = await snapshot();

        const [report] = await runFixes(db, [poiFix(poiId)], 'dry-run');

        expect(report).toMatchObject({
            key: `poi-type-${poiId.toHexString()}`,
            kind: 'normalizePoiTypes',
            status: 'pending',
            touched: 1,
        });
        expect(await snapshot()).toEqual(before);
    });

    it('normalizes the point of interest on apply and is done the second time', async () => {
        const [applied] = await runFixes(db, [poiFix(poiId)], 'apply');
        const [again] = await runFixes(db, [poiFix(poiId)], 'apply');

        expect(applied).toMatchObject({ status: 'applied', touched: 1 });
        expect(again).toMatchObject({ status: 'done', touched: 0 });
        const poi = await db
            .collection('pointsofinterest')
            .findOne({ _id: poiId });
        expect(poi?.type).toEqual(['belleholmIsland', 'forest']);
    });

    it('wraps a legacy scalar type into a list', async () => {
        await db
            .collection('pointsofinterest')
            .updateOne({ _id: poiId }, { $set: { type: 'gounet' } });

        const [report] = await runFixes(db, [poiFix(poiId)], 'apply');

        expect(report).toMatchObject({ status: 'applied', touched: 1 });
        const poi = await db
            .collection('pointsofinterest')
            .findOne({ _id: poiId });
        expect(poi?.type).toEqual(['glounet']);
    });

    it('blocks a point of interest whose repaired types leave the PoiType enum (T-11-26)', async () => {
        await db
            .collection('pointsofinterest')
            .updateOne(
                { _id: poiId },
                { $set: { type: ['gounet', 'swampy'] } },
            );
        const before = await snapshot();

        const [report] = await runFixes(db, [poiFix(poiId)], 'apply');

        expect(report).toMatchObject({
            status: 'blocked',
            touched: 0,
            unknownTypes: ['swampy'],
        });
        expect(await snapshot()).toEqual(before);
    });

    it('blocks a point of interest that does not exist', async () => {
        const [report] = await runFixes(db, [poiFix(new ObjectId())], 'apply');

        expect(report).toMatchObject({ status: 'blocked', touched: 0 });
    });

    it('renames Flinas into Kliever only once (D-06)', async () => {
        const [applied] = await runFixes(db, [renameFix(cityId)], 'apply');
        const [again] = await runFixes(db, [renameFix(cityId)], 'apply');

        expect(applied).toMatchObject({
            key: 'rename-flinas',
            kind: 'renameCity',
            status: 'applied',
            touched: 1,
        });
        expect(again).toMatchObject({ status: 'done', touched: 0 });
        const city = await db.collection('cities').findOne({ _id: cityId });
        expect(city?.name).toBe('Kliever');
    });

    it('blocks the rename when the city has another name', async () => {
        await db
            .collection('cities')
            .updateOne({ _id: cityId }, { $set: { name: 'Borgo Nuovo' } });

        const [report] = await runFixes(db, [renameFix(cityId)], 'apply');

        expect(report).toMatchObject({
            status: 'blocked',
            touched: 0,
            foundName: 'Borgo Nuovo',
        });
        const city = await db.collection('cities').findOne({ _id: cityId });
        expect(city?.name).toBe('Borgo Nuovo');
    });

    it('blocks the rename of a city that does not exist', async () => {
        const [report] = await runFixes(
            db,
            [renameFix(new ObjectId())],
            'apply',
        );

        expect(report).toMatchObject({ status: 'blocked', touched: 0 });
    });

    it('removes the unlocked flag from every lore and is done afterwards', async () => {
        const [pending] = await runFixes(db, [LORE_FIX], 'dry-run');
        const [applied] = await runFixes(db, [LORE_FIX], 'apply');
        const [again] = await runFixes(db, [LORE_FIX], 'apply');

        expect(pending).toMatchObject({ status: 'pending', touched: 2 });
        expect(applied).toMatchObject({ status: 'applied', touched: 2 });
        expect(again).toMatchObject({ status: 'done', touched: 0 });
        expect(
            await db
                .collection('lore')
                .countDocuments({ unlocked: { $exists: true } }),
        ).toBe(0);
        expect(await db.collection('lore').countDocuments()).toBe(3);
    });

    it('never writes on verify', async () => {
        const before = await snapshot();

        const reports = await runFixes(
            db,
            [poiFix(poiId), renameFix(cityId), LORE_FIX],
            'verify',
        );

        expect(reports.map((report) => report.status)).toEqual([
            'pending',
            'pending',
            'pending',
        ]);
        expect(await snapshot()).toEqual(before);
    });
});
