import { resolve } from 'path';
import { contentDirOf } from 'src/content/content-paths';
import { ContentCollection } from 'src/content/loading/content-tree';
import { PRUNABLE_COLLECTIONS } from 'src/content/sync/content-prune';
import { ContentMode } from 'src/content/sync/content-report';

export type CliCommand =
    | { mode: 'check'; contentDir: string }
    | { mode: ContentMode; contentDir: string }
    | { mode: 'export'; dir: string; contentDir: string }
    | { mode: 'prune'; collection: ContentCollection; contentDir: string }
    | { mode: 'new-id'; count: number };

export const MAX_NEW_IDS = 500;

const CONTENT_DIR_FLAG = '--content-dir';
const PLAIN_MODES = ['check', 'dry-run', 'apply', 'verify'] as const;
const VALUE_MODES = ['export', 'prune', 'new-id'] as const;
const COUNT_PATTERN = /^\d+$/;

type PlainMode = (typeof PLAIN_MODES)[number];
type ValueMode = (typeof VALUE_MODES)[number];

interface ModeFlag {
    mode: PlainMode | ValueMode;
    value: string | undefined;
}

interface SplitArgs {
    modes: ModeFlag[];
    contentDirs: string[];
}

function flagOf(token: string): string | undefined {
    return token.startsWith('--') ? token.slice(2) : undefined;
}

function isPlainMode(name: string): name is PlainMode {
    return (PLAIN_MODES as readonly string[]).includes(name);
}

function isValueMode(name: string): name is ValueMode {
    return (VALUE_MODES as readonly string[]).includes(name);
}

function valueAfter(argv: readonly string[], index: number): string | null {
    const value = argv[index + 1];
    return value === undefined || value.startsWith('--') ? null : value;
}

// null = argomento sconosciuto, valore mancante o token fuori posto
function splitArgs(argv: readonly string[]): SplitArgs | null {
    const split: SplitArgs = { modes: [], contentDirs: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        const flag = flagOf(token);
        if (flag !== undefined && isPlainMode(flag)) {
            split.modes.push({ mode: flag, value: undefined });
            continue;
        }
        const value = valueAfter(argv, index);
        if (value === null) return null;
        if (token === CONTENT_DIR_FLAG) split.contentDirs.push(value);
        else if (flag !== undefined && isValueMode(flag))
            split.modes.push({ mode: flag, value });
        else return null;
        index += 1;
    }
    return split;
}

function isPrunable(name: string): name is ContentCollection {
    return (PRUNABLE_COLLECTIONS as readonly string[]).includes(name);
}

function countOf(value: string): number | null {
    if (!COUNT_PATTERN.test(value)) return null;
    const count = Number(value);
    return count >= 1 && count <= MAX_NEW_IDS ? count : null;
}

function commandOf(flag: ModeFlag, contentDir: string): CliCommand | null {
    const { mode, value } = flag;
    if (isPlainMode(mode)) return { mode, contentDir };
    if (value === undefined) return null;
    if (mode === 'export') return { mode, dir: resolve(value), contentDir };
    if (mode === 'prune')
        return isPrunable(value)
            ? { mode, collection: value, contentDir }
            : null;
    const count = countOf(value);
    return count === null ? null : { mode, count };
}

// T-11-44: esattamente una modalità, --content-dir al più una volta, nient'altro
export function parseCliArgs(argv: readonly string[]): CliCommand | null {
    const split = splitArgs(argv);
    if (!split || split.modes.length !== 1 || split.contentDirs.length > 1)
        return null;
    return commandOf(split.modes[0], contentDirOf(split.contentDirs[0]));
}
