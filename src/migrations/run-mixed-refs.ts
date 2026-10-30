import { MongoClient } from 'mongodb';
import { describeError } from '../mongo/mongo-errors';
import {
    hasResidualRefs,
    MixedRefsMode,
    runMixedRefsMigration,
    UnsupportedMongoVersionError,
} from './mixed-refs/mixed-refs.migration';

export const MIXED_REFS_EXIT = {
    ok: 0,
    residual: 1,
    usage: 2,
    failure: 3,
} as const;

export const MIXED_REFS_USAGE =
    'Uso: node --env-file=.env dist/migrations/run-mixed-refs.js --dry-run|--apply|--verify (legge MONGO_URI e DB_NAME)';

const MODES: Record<string, MixedRefsMode> = {
    '--dry-run': 'dry-run',
    '--apply': 'apply',
    '--verify': 'verify',
};

type Environment = Record<string, string | undefined>;

function modeOf(argv: readonly string[]): MixedRefsMode | undefined {
    return argv.length === 1 ? MODES[argv[0]] : undefined;
}

function exitCodeOf(error: unknown): number {
    return error instanceof UnsupportedMongoVersionError
        ? MIXED_REFS_EXIT.usage
        : MIXED_REFS_EXIT.failure;
}

// l'errore stampato è solo nome e codice (o il messaggio del controllo di versione): mai URI, host o nome del database
function errorReportOf(error: unknown): string {
    const message =
        error instanceof UnsupportedMongoVersionError
            ? error.message
            : describeError(error);
    return JSON.stringify({ error: message });
}

export async function runCli(
    argv: readonly string[],
    env: Environment,
    out: (line: string) => void,
): Promise<number> {
    const mode = modeOf(argv);
    const { MONGO_URI: uri, DB_NAME: dbName } = env;
    if (!mode || !uri || !dbName) {
        out(MIXED_REFS_USAGE);
        return MIXED_REFS_EXIT.usage;
    }
    let client: MongoClient | undefined;
    try {
        client = await new MongoClient(uri).connect();
        const report = await runMixedRefsMigration(client.db(dbName), mode);
        out(JSON.stringify(report));
        return mode === 'verify' && hasResidualRefs(report)
            ? MIXED_REFS_EXIT.residual
            : MIXED_REFS_EXIT.ok;
    } catch (error) {
        out(errorReportOf(error));
        return exitCodeOf(error);
    } finally {
        await client?.close();
    }
}

if (require.main === module) {
    void runCli(process.argv.slice(2), process.env, (line) =>
        console.log(line),
    ).then((code) => process.exit(code));
}
