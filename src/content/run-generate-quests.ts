import { ObjectId } from 'mongodb';
import { join } from 'path';
import { checkGenerationInput } from 'src/content/checking/check-content';
import { ContentIndex, indexContent } from 'src/content/checking/content-index';
import { ContentIssue } from 'src/content/content-issue';
import { contentDirOf } from 'src/content/content-paths';
import { writeEntriesFile } from 'src/content/export/yaml-writer';
import { GENERATED_QUEST_FILES } from 'src/content/generation/city-profile';
import {
    GeneratedQuest,
    generateFixedQuests,
    GeneratorResult,
} from 'src/content/generation/fixed-quests.generator';
import {
    COLLECTION_DIRS,
    ContentTree,
    loadContentTree,
} from 'src/content/loading/content-tree';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import { FIXED_QUEST_TYPES } from 'src/content/rules/content-config';

export const GENERATE_QUESTS_EXIT = { ok: 0, errors: 1, usage: 2 } as const;

export const GENERATE_QUESTS_USAGE =
    'Uso: node dist/content/run-generate-quests.js [--content-dir <path>] (solo file: nessun database)';

export const GENERATED_QUESTS_HEADER =
    'File generato da npm run content:generate-quests (D-17..D-22, D-31): le modifiche durevoli si fanno in config.yaml o nel generatore';

const QUESTS_DIR = COLLECTION_DIRS.quests;
const CONTENT_DIR_FLAG = '--content-dir';

type Raw = Record<string, unknown>;
type Out = (line: string) => void;

// quest di un file generato che la nuova corsa non produce più: spariscono dal file e restano orfane a DB (--verify)
export interface OrphanedQuest {
    file: string;
    id: string;
    title: string;
}

export interface GenerateQuestsReport {
    mode: 'generate-quests';
    files: { file: string; entries: number }[];
    byType: Record<string, number>;
    spellDraw: number;
    skipped: GeneratorResult['skipped'];
    orphaned: OrphanedQuest[];
    errors: ContentIssue[];
}

function questPathOf(file: string): string {
    return `${QUESTS_DIR}/${file}.yaml`;
}

const GENERATED_PATHS = new Set(GENERATED_QUEST_FILES.map(questPathOf));

function sectionOf(raw: Raw, key: string): Raw {
    const section = raw[key];
    return typeof section === 'object' && section !== null
        ? (section as Raw)
        : {};
}

// solo le voci dei file del generatore: una quest scritta a mano non presta mai il suo id
function generatedEntriesOf(tree: ContentTree): LoadedEntry[] {
    return tree.entries.quests.filter((entry) =>
        GENERATED_PATHS.has(entry.file),
    );
}

function groupByFile(quests: readonly GeneratedQuest[]): Map<string, Raw[]> {
    const groups = new Map<string, Raw[]>();
    for (const { file, entry } of quests) {
        const path = questPathOf(file);
        groups.set(path, [...(groups.get(path) ?? []), entry]);
    }
    return groups;
}

function byTypeOf(quests: readonly GeneratedQuest[]): Record<string, number> {
    const counts: Record<string, number> = Object.fromEntries(
        FIXED_QUEST_TYPES.map((type) => [type, 0]),
    );
    for (const { entry } of quests) {
        const type = String(sectionOf(entry, 'infos').type);
        counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
}

function spellDrawsOf(quests: readonly GeneratedQuest[]): number {
    return quests.filter(
        ({ entry }) => sectionOf(entry, 'prizes').spellDraw === true,
    ).length;
}

function orphanedOf(
    existing: readonly LoadedEntry[],
    quests: readonly GeneratedQuest[],
): OrphanedQuest[] {
    const generatedIds = new Set(quests.map(({ entry }) => entry.id));
    return existing
        .filter((entry) => !generatedIds.has(entry.raw.id))
        .map((entry) => ({
            file: entry.file,
            id: String(entry.raw.id),
            title: String(sectionOf(entry.raw, 'infos').title),
        }));
}

function failedReport(errors: ContentIssue[]): GenerateQuestsReport {
    return {
        mode: 'generate-quests',
        files: [],
        byType: {},
        spellDraw: 0,
        skipped: [],
        orphaned: [],
        errors,
    };
}

const newObjectId = (): string => new ObjectId().toHexString();

// D-02: anche i POI dei marker portano un nome, nello stesso formato dell'export (`<città> — POI <tipi>`)
function questNamesOf(index: ContentIndex): Map<string, string> {
    const names = new Map(index.namesById);
    for (const { poi, cityId } of index.pois.values()) {
        const cityName = index.cities.get(cityId)?.name ?? cityId;
        if (!names.has(poi.id))
            names.set(poi.id, `${cityName} — POI ${poi.type.join(', ')}`);
    }
    return names;
}

// T-11-79: solo file del repo, nessun database né ambiente; T-11-77: un albero con errori non genera nulla
export function runGenerateQuests(
    contentDir: string,
    newId: () => string = newObjectId,
): GenerateQuestsReport {
    const tree = loadContentTree(contentDir);
    const { errors } = checkGenerationInput(tree);
    if (errors.length > 0 || !tree.config) return failedReport(errors);
    const index = indexContent(tree);
    const existing = generatedEntriesOf(tree);
    const result = generateFixedQuests({
        index,
        config: tree.config,
        existingQuests: existing.map((entry) => entry.raw),
        newId,
    });
    const groups = groupByFile(result.quests);
    const names = questNamesOf(index);
    for (const [path, entries] of groups) {
        writeEntriesFile(
            join(contentDir, path),
            entries,
            names,
            GENERATED_QUESTS_HEADER,
        );
    }
    return {
        mode: 'generate-quests',
        files: [...groups]
            .map(([file, entries]) => ({ file, entries: entries.length }))
            .sort((a, b) => a.file.localeCompare(b.file)),
        byType: byTypeOf(result.quests),
        spellDraw: spellDrawsOf(result.quests),
        skipped: result.skipped,
        orphaned: orphanedOf(existing, result.quests),
        errors: [],
    };
}

// undefined = argomenti errati; null = --content-dir assente
function contentDirFlagOf(argv: readonly string[]): string | null | undefined {
    if (argv.length === 0) return null;
    const [flag, value] = argv;
    return argv.length === 2 && flag === CONTENT_DIR_FLAG && value
        ? value
        : undefined;
}

function generate(argv: readonly string[], out: Out): number {
    const flag = contentDirFlagOf(argv);
    if (flag === undefined) {
        out(GENERATE_QUESTS_USAGE);
        return GENERATE_QUESTS_EXIT.usage;
    }
    const report = runGenerateQuests(contentDirOf(flag ?? undefined));
    out(JSON.stringify(report));
    return report.errors.length > 0
        ? GENERATE_QUESTS_EXIT.errors
        : GENERATE_QUESTS_EXIT.ok;
}

// stessa forma asincrona di runCli: il chiamante attende l'uscita prima di process.exit
export function main(argv: readonly string[], out: Out): Promise<number> {
    return Promise.resolve(generate(argv, out));
}

if (require.main === module) {
    void main(process.argv.slice(2), (line) => console.log(line)).then((code) =>
        process.exit(code),
    );
}
