// richiede `dist/` già compilato: `npm run build` prima di questa spec
import { spawn } from 'child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Db, MongoClient } from 'mongodb';
import { WorldCity } from 'src/content/loading/content-tree';
import { loadTestContentTree } from '../../test/fixtures/content-tree.fixture';
import { seedWorld } from '../../test/content/seed-world';
import { ContentCheck } from './checking/check-content';
import { ContentReport } from './sync/content-report';

const CLI_DB_NAME = 'content-cli-test';
const COMPILED_CLI = resolve(__dirname, '../../dist/content/run-content.js');
const TEST_CONTENT = resolve(__dirname, '../../test/content-fixtures');
const UNREACHABLE_URI = 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=500';
const NEW_ID_LINE = /^- '[0-9a-f]{24}'$/;

type ChildEnvironment = Record<string, string | undefined>;

interface CliRun {
    status: number | null;
    stdout: string;
}

const printed: string[] = [];

function offlineEnvironment(): ChildEnvironment {
    return { PATH: process.env.PATH };
}

function databaseEnvironment(uri = process.env.MONGO_TEST_URI) {
    return { PATH: process.env.PATH, MONGO_URI: uri, DB_NAME: CLI_DB_NAME };
}

function runCompiledCli(
    args: string[],
    env: ChildEnvironment = databaseEnvironment(),
): Promise<CliRun> {
    return new Promise((done, fail) => {
        const child = spawn(process.execPath, [COMPILED_CLI, ...args], {
            env,
        });
        let stdout = '';
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.on('error', fail);
        child.on('close', (status) => {
            printed.push(stdout);
            done({ status, stdout });
        });
    });
}

function reportOf<T>(run: CliRun): T {
    return JSON.parse(run.stdout.trim()) as T;
}

function syncWrites(report: ContentReport): number[] {
    return Object.values(report.collections).flatMap((collection) => [
        collection.inserted,
        collection.modified,
    ]);
}

function writeBrokenTree(dir: string): void {
    cpSync(TEST_CONTENT, dir, { recursive: true });
    writeFileSync(
        join(dir, 'lore', 'rotta.yaml'),
        "- id: '64b0000000000000000000ff'\n",
    );
}

describe('compiled run-content CLI (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let world: WorldCity[];
    const temporaryDirs: string[] = [];

    function temporaryDir(): string {
        const dir = mkdtempSync(join(tmpdir(), 'content-cli-'));
        temporaryDirs.push(dir);
        return dir;
    }

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(CLI_DB_NAME);
        world = loadTestContentTree().world ?? [];
    });

    beforeEach(async () => {
        await db.dropDatabase();
        await seedWorld(db, world);
    });

    afterAll(async () => {
        temporaryDirs.forEach((dir) =>
            rmSync(dir, { recursive: true, force: true }),
        );
        await db.dropDatabase();
        await client.close();
    });

    it('checks the test tree offline without any environment', async () => {
        const run = await runCompiledCli(
            ['--check', '--content-dir', TEST_CONTENT],
            offlineEnvironment(),
        );
        const report = reportOf<ContentCheck & { mode: string }>(run);

        expect(run.status).toBe(0);
        expect(report.mode).toBe('check');
        expect(report.errors).toEqual([]);
    });

    it('fails the check of a broken tree', async () => {
        const dir = temporaryDir();
        writeBrokenTree(dir);

        const run = await runCompiledCli(
            ['--check', '--content-dir', dir],
            offlineEnvironment(),
        );

        expect(run.status).toBe(1);
        expect(reportOf<ContentCheck>(run).errors).not.toEqual([]);
    });

    it('reports a crash of an offline mode as a failure, never as drift', async () => {
        const dir = temporaryDir();
        cpSync(TEST_CONTENT, dir, { recursive: true });
        mkdirSync(join(dir, 'lore', 'cartella.yaml'));

        const run = await runCompiledCli(
            ['--check', '--content-dir', dir],
            offlineEnvironment(),
        );

        expect(run.status).toBe(3);
        expect(reportOf<{ error: string }>(run)).toEqual({
            error: 'Error, code EISDIR',
        });
    });

    it('prints new quoted ids without any environment', async () => {
        const run = await runCompiledCli(
            ['--new-id', '3'],
            offlineEnvironment(),
        );
        const lines = run.stdout.trim().split('\n');

        expect(run.status).toBe(0);
        expect(lines.filter((line) => NEW_ID_LINE.test(line))).toHaveLength(3);
        expect(new Set(lines).size).toBe(3);
    });

    it('exits with usage on missing environment or wrong arguments', async () => {
        const runs = await Promise.all([
            runCompiledCli(['--verify'], offlineEnvironment()),
            runCompiledCli(['--prune', 'cities']),
            runCompiledCli([]),
        ]);

        expect(runs.map((run) => run.status)).toEqual([2, 2, 2]);
        expect(await db.collection('lore').countDocuments()).toBe(0);
    });

    it('runs dry-run, apply, verify and a second apply on the compiled script (D-27)', async () => {
        const args = ['--content-dir', TEST_CONTENT];

        const dryRun = await runCompiledCli(['--dry-run', ...args]);
        const applied = await runCompiledCli(['--apply', ...args]);
        const verified = await runCompiledCli(['--verify', ...args]);
        const second = await runCompiledCli(['--apply', ...args]);
        const writes = syncWrites(reportOf<ContentReport>(second));

        expect([dryRun, applied, verified].map((run) => run.status)).toEqual([
            0, 0, 0,
        ]);
        expect(second.status).toBe(0);
        expect(writes).toEqual(writes.map(() => 0));
        expect(await db.collection('lore').countDocuments()).toBe(3);
    });

    it('refuses to export into a folder that is not empty', async () => {
        const full = temporaryDir();
        writeFileSync(join(full, 'presente.yaml'), '[]\n');
        const empty = temporaryDir();
        const target = join(empty, 'export');
        mkdirSync(target);

        const refused = await runCompiledCli(['--export', full]);
        const exported = await runCompiledCli(['--export', target]);

        expect(refused.status).toBe(2);
        expect(exported.status).toBe(0);
        expect(existsSync(join(target, 'world', 'cities.yaml'))).toBe(true);
    });

    it('never prints the connection string', async () => {
        const run = await runCompiledCli(
            ['--verify', '--content-dir', TEST_CONTENT],
            databaseEnvironment(UNREACHABLE_URI),
        );

        expect(run.status).toBe(3);
        expect(run.stdout).not.toContain('mongodb://');
        expect(run.stdout).not.toContain('127.0.0.1');
        expect(printed.length).toBeGreaterThan(1);
        expect(
            printed.filter((stdout) =>
                stdout.includes(process.env.MONGO_TEST_URI as string),
            ),
        ).toEqual([]);
    });
});
