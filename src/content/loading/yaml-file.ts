import { Document, isMap, isSeq, LineCounter, Node, parseDocument } from 'yaml';
import { ContentIssue } from 'src/content/content-issue';
import { isObjectIdHex } from 'src/mongo/document-id';

export interface LoadedEntry {
    file: string;
    line: number;
    raw: Record<string, unknown>;
}

export interface ParsedYaml {
    value: unknown;
    entries: LoadedEntry[];
    issues: ContentIssue[];
}

function lineOf(lineCounter: LineCounter, offset: number): number {
    return lineCounter.linePos(offset).line;
}

function parseIssues(
    file: string,
    document: Document,
    lineCounter: LineCounter,
): ContentIssue[] {
    return document.errors.map((error) => ({
        file,
        line: lineOf(lineCounter, error.pos[0]),
        entryId: null,
        path: '',
        message: `YAML non valido: ${error.message}`,
    }));
}

// un id senza apici può diventare un numero in YAML 1.2 (Pitfall 6): l'id è valido solo come stringa esadecimale minuscola a 24
function idIssueOf(entry: LoadedEntry): ContentIssue | null {
    if (!('id' in entry.raw)) return null;
    const { id } = entry.raw;
    const issue = { file: entry.file, line: entry.line, path: 'id' };
    if (typeof id !== 'string') {
        return {
            ...issue,
            entryId: null,
            message: 'id non stringa (va fra apici)',
        };
    }
    if (!isObjectIdHex(id)) {
        return {
            ...issue,
            entryId: id,
            message: `id non valido: «${id}» (24 caratteri esadecimali minuscoli)`,
        };
    }
    return null;
}

function entryOf(
    file: string,
    node: unknown,
    document: Document,
    lineCounter: LineCounter,
): LoadedEntry | ContentIssue {
    const line = lineOf(lineCounter, (node as Node).range?.[0] ?? 0);
    if (!isMap(node)) {
        return {
            file,
            line,
            entryId: null,
            path: '',
            message: 'la voce non è una mappa chiave: valore',
        };
    }
    return {
        file,
        line,
        raw: node.toJS(document) as Record<string, unknown>,
    };
}

function isIssue(value: LoadedEntry | ContentIssue): value is ContentIssue {
    return 'message' in value;
}

export function parseYamlFile(file: string, text: string): ParsedYaml {
    const lineCounter = new LineCounter();
    const document = parseDocument(text, {
        lineCounter,
        uniqueKeys: true,
        prettyErrors: false,
    });
    if (document.errors.length > 0) {
        return {
            value: null,
            entries: [],
            issues: parseIssues(file, document, lineCounter),
        };
    }
    const value: unknown = document.toJS();
    if (!isSeq(document.contents)) return { value, entries: [], issues: [] };

    const entries: LoadedEntry[] = [];
    const issues: ContentIssue[] = [];
    for (const node of document.contents.items) {
        const loaded = entryOf(file, node, document, lineCounter);
        if (isIssue(loaded)) {
            issues.push(loaded);
            continue;
        }
        entries.push(loaded);
        const idIssue = idIssueOf(loaded);
        if (idIssue) issues.push(idIssue);
    }
    return { value, entries, issues };
}
