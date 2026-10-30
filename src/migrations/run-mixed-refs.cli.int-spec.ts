// richiede `dist/` già compilato: la CI esegue `npm run build` prima dei test; in locale i piani 10-29 e 10-31 compilano prima
import { spawn } from 'child_process';
import { resolve } from 'path';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { MixedRefsReport } from './mixed-refs/mixed-refs.migration';

const CLI_DB_NAME = 'mixed-refs-cli-test';
const COMPILED_CLI = resolve(
    __dirname,
    '../../dist/migrations/run-mixed-refs.js',
);

interface CliRun {
    status: number | null;
    stdout: string;
}

function cliEnvironment(): NodeJS.ProcessEnv {
    return {
        PATH: process.env.PATH,
        MONGO_URI: process.env.MONGO_TEST_URI,
        DB_NAME: CLI_DB_NAME,
    };
}

function runCompiledCli(args: string[]): Promise<CliRun> {
    return new Promise((done, fail) => {
        const child = spawn(process.execPath, [COMPILED_CLI, ...args], {
            env: cliEnvironment(),
        });
        let stdout = '';
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.on('error', fail);
        child.on('close', (status) => done({ status, stdout }));
    });
}

function reportOf(run: CliRun): MixedRefsReport {
    return JSON.parse(run.stdout.trim()) as MixedRefsReport;
}

function totalOf(
    report: MixedRefsReport,
    field: 'residual' | 'modified',
): number {
    return report.paths.reduce((sum, entry) => sum + entry[field], 0);
}

async function seedLegacyReferences(db: Db): Promise<void> {
    await db
        .collection('users')
        .insertOne({ currentCharacter: new ObjectId().toHexString() });
    await db.collection('characters').insertOne({
        status: { spells: [new ObjectId().toHexString()] },
        assets: {
            ownedItems: [{ item: new ObjectId().toHexString(), quantity: 2 }],
        },
    });
}

describe('compiled run-mixed-refs CLI (replSet)', () => {
    let client: MongoClient;
    let db: Db;

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(CLI_DB_NAME);
    });

    beforeEach(async () => {
        await db.dropDatabase();
        await seedLegacyReferences(db);
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('reports without writing on --dry-run with exit 0 (D-17d)', async () => {
        const run = await runCompiledCli(['--dry-run']);
        const report = reportOf(run);
        const verify = await runCompiledCli(['--verify']);

        expect(run.status).toBe(0);
        expect(report.mode).toBe('dry-run');
        expect(totalOf(report, 'residual')).toBe(3);
        expect(totalOf(reportOf(verify), 'residual')).toBe(3);
    });

    it('fails --verify with exit 1 while references are left (D-17d)', async () => {
        const run = await runCompiledCli(['--verify']);

        expect(run.status).toBe(1);
        expect(reportOf(run).mode).toBe('verify');
    });

    it('applies, then verifies with exit 0 (D-17d)', async () => {
        const applied = await runCompiledCli(['--apply']);
        const verified = await runCompiledCli(['--verify']);

        expect([applied.status, verified.status]).toEqual([0, 0]);
        expect(totalOf(reportOf(applied), 'modified')).toBe(3);
        expect(totalOf(reportOf(verified), 'residual')).toBe(0);
    });

    it('modifies nothing on a second --apply (D-17d)', async () => {
        await runCompiledCli(['--apply']);

        const second = await runCompiledCli(['--apply']);

        expect(second.status).toBe(0);
        expect(totalOf(reportOf(second), 'modified')).toBe(0);
    });

    it('exits 2 without a mode flag (D-17d)', async () => {
        const run = await runCompiledCli([]);

        expect(run.status).toBe(2);
        expect(await db.collection('users').countDocuments()).toBe(1);
    });

    it('never prints the connection string (D-17d)', async () => {
        const outputs = await Promise.all(
            [['--dry-run'], ['--verify'], ['--apply'], []].map(runCompiledCli),
        );

        expect(outputs.map((run) => run.stdout.includes('mongodb://'))).toEqual(
            [false, false, false, false],
        );
    });
});
