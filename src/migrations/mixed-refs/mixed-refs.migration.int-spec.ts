import { Admin, Db, Document, MongoClient, ObjectId } from 'mongodb';
import { runCli } from '../run-mixed-refs';
import { MIXED_REF_PATHS, MixedRefPath } from './mixed-ref-paths';
import { MixedRefsReport, runMixedRefsMigration } from './mixed-refs.migration';

const DB_NAME = 'mixed-refs-test';

interface LegacySeed {
    collection: string;
    before: Document;
    after: Document;
    keepsLegacyString?: boolean;
}

function nested(path: string, value: unknown): Document {
    return path
        .split('.')
        .reduceRight<unknown>(
            (inner, key) => ({ [key]: inner }),
            value,
        ) as Document;
}

function hexPair(): [string, ObjectId] {
    const id = new ObjectId();
    return [id.toHexString(), id];
}

function seedFor(ref: MixedRefPath): LegacySeed[] {
    const [hex, converted] = hexPair();
    const kept = new ObjectId();
    const upper = hex.toUpperCase();
    const label = 'legacy-name';
    const seed = (before: unknown, after: unknown): LegacySeed => {
        const _id = new ObjectId();
        return {
            collection: ref.collection,
            before: { _id, ...nested(ref.path, before) },
            after: { _id, ...nested(ref.path, after) },
            keepsLegacyString: before === upper || before === label,
        };
    };
    if (ref.shape === 'array') {
        return [
            seed([hex, kept, upper, label], [converted, kept, upper, label]),
        ];
    }
    if (ref.shape === 'subdocArray') {
        const key = ref.key ?? '';
        const entry = (value: unknown) => ({ [key]: value, quantity: 2 });
        return [
            seed(
                [entry(hex), entry(kept), entry(upper), entry(label)],
                [entry(converted), entry(kept), entry(upper), entry(label)],
            ),
        ];
    }
    return [
        seed(hex, converted),
        seed(kept, kept),
        seed(upper, upper),
        seed(label, label),
    ];
}

const POI_SCALAR_ID = new ObjectId();
const POI_LIST_ID = new ObjectId();

function poiTypeSeeds(): LegacySeed[] {
    return [
        {
            collection: 'pointsofinterest',
            before: { _id: POI_SCALAR_ID, type: 'city' },
            after: { _id: POI_SCALAR_ID, type: ['city'] },
        },
        {
            collection: 'pointsofinterest',
            before: { _id: POI_LIST_ID, type: ['inn', 'shop'] },
            after: { _id: POI_LIST_ID, type: ['inn', 'shop'] },
        },
    ];
}

function scalarCount(): number {
    return MIXED_REF_PATHS.filter((ref) => ref.shape === 'scalar').length;
}

function totalOf(
    report: MixedRefsReport,
    field: 'residual' | 'modified',
): number {
    return report.paths.reduce((sum, entry) => sum + entry[field], 0);
}

describe('runMixedRefsMigration (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let seeds: LegacySeed[];

    async function snapshot(): Promise<Record<string, Document[]>> {
        const collections = [...new Set(seeds.map((s) => s.collection))];
        const entries = await Promise.all(
            collections.map(
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

    async function storedOf(seed: LegacySeed): Promise<Document | null> {
        return db.collection(seed.collection).findOne({ _id: seed.before._id });
    }

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(DB_NAME);
    });

    beforeEach(async () => {
        await db.dropDatabase();
        seeds = [...MIXED_REF_PATHS.flatMap(seedFor), ...poiTypeSeeds()];
        for (const seed of seeds) {
            await db.collection(seed.collection).insertOne({ ...seed.before });
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('reports the convertible string references per path without writing (dry-run)', async () => {
        const before = await snapshot();

        const report = await runMixedRefsMigration(db, 'dry-run');

        expect(report.mode).toBe('dry-run');
        expect(report.paths).toHaveLength(MIXED_REF_PATHS.length);
        for (const entry of report.paths) {
            expect(entry).toEqual({
                collection: entry.collection,
                path: entry.path,
                residual: 1,
                modified: 0,
            });
        }
        expect(report.poiTypeScalars).toBe(1);
        expect(await snapshot()).toEqual(before);
    });

    it('converts every hex string reference into an ObjectId (apply)', async () => {
        const report = await runMixedRefsMigration(db, 'apply');

        expect(totalOf(report, 'modified')).toBe(MIXED_REF_PATHS.length);
        for (const seed of seeds) {
            expect(await storedOf(seed)).toEqual(seed.after);
        }
    });

    it('leaves non hex and uppercase strings untouched', async () => {
        await runMixedRefsMigration(db, 'apply');

        const untouched = seeds.filter((seed) => seed.keepsLegacyString);
        expect(untouched).toHaveLength(2 * scalarCount());
        for (const seed of untouched) {
            expect(await storedOf(seed)).toEqual(seed.before);
        }
    });

    it('is idempotent: a second apply modifies nothing', async () => {
        await runMixedRefsMigration(db, 'apply');
        const afterFirst = await snapshot();

        const second = await runMixedRefsMigration(db, 'apply');

        expect(totalOf(second, 'modified')).toBe(0);
        expect(second.poiTypeNormalized).toBe(0);
        expect(await snapshot()).toEqual(afterFirst);
    });

    it('verifies zero residual references after apply', async () => {
        const pending = await runMixedRefsMigration(db, 'verify');
        await runMixedRefsMigration(db, 'apply');

        const verified = await runMixedRefsMigration(db, 'verify');

        expect(totalOf(pending, 'residual')).toBe(MIXED_REF_PATHS.length);
        expect(totalOf(verified, 'residual')).toBe(0);
        expect(verified.poiTypeScalars).toBe(0);
    });

    it('normalizes a scalar point of interest type into a list', async () => {
        const report = await runMixedRefsMigration(db, 'apply');

        expect(report.poiTypeNormalized).toBe(1);
        expect(report.poiTypeScalars).toBe(0);
        for (const seed of poiTypeSeeds()) {
            expect(await storedOf(seed)).toEqual(seed.after);
        }
    });

    it('stops below MongoDB 4.2', async () => {
        jest.spyOn(Admin.prototype, 'serverInfo').mockResolvedValue({
            version: '4.0.0',
        });
        const before = await snapshot();

        await expect(runMixedRefsMigration(db, 'apply')).rejects.toThrow(
            'MongoDB >= 4.2 is required for the reference migration',
        );
        expect(await snapshot()).toEqual(before);
    });

    describe('runCli', () => {
        const env = () => ({
            MONGO_URI: process.env.MONGO_TEST_URI,
            DB_NAME,
        });

        async function cli(argv: string[]): Promise<[number, string[]]> {
            const lines: string[] = [];
            const code = await runCli(argv, env(), (line) => lines.push(line));
            return [code, lines];
        }

        it('exits 1 from --verify while references are left, 0 after --apply', async () => {
            const [pending] = await cli(['--verify']);
            const [applied] = await cli(['--apply']);
            const [verified] = await cli(['--verify']);

            expect([pending, applied, verified]).toEqual([1, 0, 0]);
        });

        it('exits 2 on a missing or unknown flag', async () => {
            const connect = jest.spyOn(MongoClient.prototype, 'connect');

            const outcomes = await Promise.all(
                [[], ['--force'], ['--help'], ['--apply', '--verify']].map(
                    async (argv) => (await cli(argv))[0],
                ),
            );
            const withoutDatabase = await runCli(
                ['--verify'],
                { MONGO_URI: process.env.MONGO_TEST_URI },
                () => undefined,
            );

            expect(outcomes).toEqual([2, 2, 2, 2]);
            expect(withoutDatabase).toBe(2);
            expect(connect).not.toHaveBeenCalled();
        });

        it('exits 2 below MongoDB 4.2 without writing', async () => {
            jest.spyOn(Admin.prototype, 'serverInfo').mockResolvedValue({
                version: '4.0.0',
            });
            const before = await snapshot();

            const [code, lines] = await cli(['--apply']);

            expect(code).toBe(2);
            expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
                {
                    error: 'MongoDB >= 4.2 is required for the reference migration',
                },
            ]);
            expect(await snapshot()).toEqual(before);
        });

        it('prints a JSON report of counts only, without the connection string', async () => {
            const [, lines] = await cli(['--dry-run']);

            expect(lines).toHaveLength(1);
            const report = JSON.parse(lines[0]) as MixedRefsReport;
            expect(Object.keys(report).sort()).toEqual([
                'mode',
                'paths',
                'poiTypeNormalized',
                'poiTypeScalars',
                'serverVersion',
            ]);
            expect(Object.keys(report.paths[0]).sort()).toEqual([
                'collection',
                'modified',
                'path',
                'residual',
            ]);
            expect(lines[0].includes(env().MONGO_URI as string)).toBe(false);
        });
    });
});
