import { Db, MongoClient, ObjectId } from 'mongodb';
import { catalogStats } from 'src/content/analysis/catalog-stats';
import { checkContent, ContentCheck } from 'src/content/checking/check-content';
import { CliCommand, parseCliArgs } from 'src/content/cli-args';
import {
    ExportDirNotEmptyError,
    exportContent,
} from 'src/content/export/export-content';
import {
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
    loadContentTree,
} from 'src/content/loading/content-tree';
import { hasDrift, hasErrors } from 'src/content/sync/content-report';
import { pruneCollection } from 'src/content/sync/content-prune';
import { runContent } from 'src/content/sync/content-sync';
import { describeError } from 'src/mongo/mongo-errors';

export const CONTENT_EXIT = {
    ok: 0,
    drift: 1,
    usage: 2,
    failure: 3,
} as const;

export const CONTENT_USAGE =
    'Uso: node [--env-file=<file>] dist/content/run-content.js --check|--stats|--dry-run|--apply|--verify|--export <dir>|--prune <quests|lore>|--new-id <N> [--content-dir <path>] (MONGO_URI e DB_NAME servono a tutte le modalità tranne --check, --stats e --new-id)';

type Environment = Record<string, string | undefined>;
type Out = (line: string) => void;
type ExitCode = (typeof CONTENT_EXIT)[keyof typeof CONTENT_EXIT];
type OfflineCommand = Extract<
    CliCommand,
    { mode: 'check' | 'stats' | 'new-id' }
>;
type DatabaseCommand = Exclude<CliCommand, OfflineCommand>;

interface CheckReport extends ContentCheck {
    mode: 'check';
    counts: Record<ContentCollection, number>;
}

interface Connection {
    uri: string;
    dbName: string;
}

const OFFLINE_MODES: readonly CliCommand['mode'][] = [
    'check',
    'stats',
    'new-id',
];

function isOffline(command: CliCommand): command is OfflineCommand {
    return OFFLINE_MODES.includes(command.mode);
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

function checkReportOf(tree: ContentTree, check: ContentCheck): CheckReport {
    return { mode: 'check', counts: countsOf(tree), ...check };
}

function runCheck(contentDir: string, out: Out): ExitCode {
    const tree = loadContentTree(contentDir);
    const check = checkContent(tree);
    out(JSON.stringify(checkReportOf(tree, check)));
    return exitOf(check.errors.length > 0);
}

// un albero con errori stampa il report di --check: le misure su dati invalidi ingannerebbero
function runStats(contentDir: string, out: Out): ExitCode {
    const tree = loadContentTree(contentDir);
    const check = checkContent(tree);
    if (check.errors.length > 0) {
        out(JSON.stringify(checkReportOf(tree, check)));
        return CONTENT_EXIT.drift;
    }
    out(JSON.stringify(catalogStats(tree)));
    return CONTENT_EXIT.ok;
}

// stesso formato di una lista YAML: le righe si copiano così come sono nei file
function printNewIds(count: number, out: Out): ExitCode {
    for (let printed = 0; printed < count; printed += 1)
        out(`- '${new ObjectId().toHexString()}'`);
    return CONTENT_EXIT.ok;
}

function runOfflineMode(command: OfflineCommand, out: Out): ExitCode {
    if (command.mode === 'new-id') return printNewIds(command.count, out);
    return command.mode === 'check'
        ? runCheck(command.contentDir, out)
        : runStats(command.contentDir, out);
}

// un crash (file illeggibile, regola che lancia) è un failure con il suo report, mai un drift
function runOffline(command: OfflineCommand, out: Out): ExitCode {
    try {
        return runOfflineMode(command, out);
    } catch (error) {
        out(errorReportOf(error));
        return exitCodeOf(error);
    }
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

// T-11-43: l'ambiente arriva come oggetto; --check, --stats e --new-id non lo leggono e non si connettono
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
    const print: Out = (line) => console.log(line);
    void runCli(process.argv.slice(2), process.env, print)
        .catch((error: unknown) => {
            print(errorReportOf(error));
            return CONTENT_EXIT.failure;
        })
        .then((code) => process.exit(code));
}
