import { Db, MongoClient, ObjectId } from 'mongodb';
import { describeError } from '../mongo/mongo-errors';
import { checkContent, ContentCheck } from './checking/check-content';
import { CliCommand, parseCliArgs } from './cli-args';
import { ExportDirNotEmptyError, exportContent } from './export/export-content';
import {
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
    loadContentTree,
} from './loading/content-tree';
import { hasDrift, hasErrors } from './sync/content-report';
import { pruneCollection } from './sync/content-prune';
import { runContent } from './sync/content-sync';

export const CONTENT_EXIT = {
    ok: 0,
    drift: 1,
    usage: 2,
    failure: 3,
} as const;

export const CONTENT_USAGE =
    'Uso: node [--env-file=<file>] dist/content/run-content.js --check|--dry-run|--apply|--verify|--export <dir>|--prune <collezione>|--new-id <N> [--content-dir <path>] (MONGO_URI e DB_NAME servono a tutte le modalità tranne --check e --new-id)';

type Environment = Record<string, string | undefined>;
type Out = (line: string) => void;
type ExitCode = (typeof CONTENT_EXIT)[keyof typeof CONTENT_EXIT];
type OfflineCommand = Extract<CliCommand, { mode: 'check' | 'new-id' }>;
type DatabaseCommand = Exclude<CliCommand, OfflineCommand>;

interface CheckReport extends ContentCheck {
    mode: 'check';
    counts: Record<ContentCollection, number>;
}

interface Connection {
    uri: string;
    dbName: string;
}

function isOffline(command: CliCommand): command is OfflineCommand {
    return command.mode === 'check' || command.mode === 'new-id';
}

function connectionOf(env: Environment): Connection | null {
    const { MONGO_URI: uri, DB_NAME: dbName } = env;
    return uri && dbName ? { uri, dbName } : null;
}

function exitOf(failed: boolean): ExitCode {
    return failed ? CONTENT_EXIT.drift : CONTENT_EXIT.ok;
}

function countsOf(tree: ContentTree): Record<ContentCollection, number> {
    return Object.fromEntries(
        CONTENT_COLLECTIONS.map((name) => [name, tree.entries[name].length]),
    ) as Record<ContentCollection, number>;
}

function runCheck(contentDir: string, out: Out): ExitCode {
    const tree = loadContentTree(contentDir);
    const check = checkContent(tree);
    const report: CheckReport = {
        mode: 'check',
        counts: countsOf(tree),
        ...check,
    };
    out(JSON.stringify(report));
    return exitOf(check.errors.length > 0);
}

// stesso formato di una lista YAML: le righe si copiano così come sono nei file
function printNewIds(count: number, out: Out): ExitCode {
    for (let printed = 0; printed < count; printed += 1)
        out(`- '${new ObjectId().toHexString()}'`);
    return CONTENT_EXIT.ok;
}

function runOffline(command: OfflineCommand, out: Out): ExitCode {
    return command.mode === 'check'
        ? runCheck(command.contentDir, out)
        : printNewIds(command.count, out);
}

async function runOnDatabase(
    db: Db,
    command: DatabaseCommand,
    out: Out,
): Promise<ExitCode> {
    if (command.mode === 'export') {
        out(JSON.stringify(await exportContent(db, command.dir)));
        return CONTENT_EXIT.ok;
    }
    const tree = loadContentTree(command.contentDir);
    if (command.mode === 'prune') {
        const report = await pruneCollection(db, command.collection, tree);
        out(JSON.stringify(report));
        return exitOf(report.errors.length > 0 || report.blocked.length > 0);
    }
    const report = await runContent(db, command.mode, tree);
    out(JSON.stringify(report));
    return exitOf(
        command.mode === 'verify' ? hasDrift(report) : hasErrors(report),
    );
}

function exitCodeOf(error: unknown): ExitCode {
    return error instanceof ExportDirNotEmptyError
        ? CONTENT_EXIT.usage
        : CONTENT_EXIT.failure;
}

// T-11-42: l'errore stampato è solo nome e codice (o la cartella di export già piena): mai URI, host o nome del database
function errorReportOf(error: unknown): string {
    const message =
        error instanceof ExportDirNotEmptyError
            ? error.message
            : describeError(error);
    return JSON.stringify({ error: message });
}

async function runConnected(
    connection: Connection,
    command: DatabaseCommand,
    out: Out,
): Promise<ExitCode> {
    let client: MongoClient | undefined;
    try {
        client = await new MongoClient(connection.uri).connect();
        return await runOnDatabase(client.db(connection.dbName), command, out);
    } catch (error) {
        out(errorReportOf(error));
        return exitCodeOf(error);
    } finally {
        await client?.close();
    }
}

// T-11-43: l'ambiente arriva come oggetto; --check e --new-id non lo leggono e non si connettono
export async function runCli(
    argv: readonly string[],
    env: Environment,
    out: Out,
): Promise<number> {
    const command = parseCliArgs(argv);
    if (command && isOffline(command)) return runOffline(command, out);
    const connection = connectionOf(env);
    if (!command || !connection) {
        out(CONTENT_USAGE);
        return CONTENT_EXIT.usage;
    }
    return runConnected(connection, command, out);
}

if (require.main === module) {
    void runCli(process.argv.slice(2), process.env, (line) =>
        console.log(line),
    ).then((code) => process.exit(code));
}
