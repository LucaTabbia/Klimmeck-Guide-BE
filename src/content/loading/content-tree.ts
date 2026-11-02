import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ContentIssue } from 'src/content/content-issue';
import {
    LoadedEntry,
    ParsedYaml,
    parseYamlFile,
} from 'src/content/loading/yaml-file';
import {
    ContentConfig,
    parseContentConfig,
} from 'src/content/rules/content-config';

// ordine di caricamento D-27: ogni collezione referenzia solo quelle che la precedono
export const CONTENT_COLLECTIONS = [
    'lore',
    'spells',
    'equipmentitems',
    'lootitems',
    'enemies',
    'pets',
    'quests',
] as const;

export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

export const COLLECTION_DIRS: Record<ContentCollection, string> = {
    lore: 'lore',
    spells: 'spells',
    equipmentitems: 'equipment',
    lootitems: 'loot',
    enemies: 'enemies',
    pets: 'pets',
    quests: 'quests',
};

export const CONFIG_FILE = 'config.yaml';
export const IMAGES_FILE = 'images.yaml';
export const WORLD_FILE = 'world/cities.yaml';
export const FIXES_DIR = 'fixes';

export interface WorldPoi {
    id: string;
    type: string[];
    location: [number, number];
}

export interface WorldCity {
    id: string;
    name: string;
    type: string;
    markerLocation: string;
    relatedLore: string | null;
    pointsOfInterest: WorldPoi[];
}

export interface ImageLink {
    id: string;
    url: string;
}

export interface ImagesFile {
    lore: ImageLink[];
    enemies: ImageLink[];
    pets: ImageLink[];
}

export interface ContentTree {
    dir: string;
    entries: Record<ContentCollection, LoadedEntry[]>;
    fixes: LoadedEntry[];
    images: ImagesFile;
    world: WorldCity[] | null;
    config: ContentConfig | null;
    issues: ContentIssue[];
}

const IMAGE_SECTIONS = ['lore', 'enemies', 'pets'] as const;

function fileIssue(file: string, message: string): ContentIssue {
    return { file, line: null, entryId: null, path: '', message };
}

function readYaml(dir: string, file: string): ParsedYaml | null {
    const path = join(dir, file);
    if (!existsSync(path)) return null;
    return parseYamlFile(file, readFileSync(path, 'utf8'));
}

function yamlFilesOf(dir: string, folder: string): string[] {
    const path = join(dir, folder);
    if (!existsSync(path)) return [];
    return readdirSync(path)
        .filter((name) => name.endsWith('.yaml'))
        .sort()
        .map((name) => `${folder}/${name}`);
}

function loadFolder(
    dir: string,
    folder: string,
    issues: ContentIssue[],
): LoadedEntry[] {
    return yamlFilesOf(dir, folder).flatMap((file) => {
        const parsed = readYaml(dir, file)!;
        issues.push(...parsed.issues);
        const isList = Array.isArray(parsed.value) || parsed.value === null;
        if (!isList && parsed.issues.length === 0) {
            issues.push(
                fileIssue(file, 'il file deve essere una lista di voci'),
            );
        }
        return parsed.entries;
    });
}

function loadConfig(dir: string, issues: ContentIssue[]): ContentConfig | null {
    const parsed = readYaml(dir, CONFIG_FILE);
    if (!parsed) {
        issues.push(fileIssue(CONFIG_FILE, 'config.yaml mancante'));
        return null;
    }
    issues.push(...parsed.issues);
    if (parsed.issues.length > 0) return null;
    const { config, issues: configIssues } = parseContentConfig(
        parsed.value,
        CONFIG_FILE,
    );
    issues.push(...configIssues);
    return config;
}

function imageLinksOf(value: unknown): ImageLink[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (link): link is ImageLink =>
            typeof (link as ImageLink)?.id === 'string' &&
            typeof (link as ImageLink)?.url === 'string',
    );
}

function loadImages(dir: string, issues: ContentIssue[]): ImagesFile {
    const parsed = readYaml(dir, IMAGES_FILE);
    const images: ImagesFile = { lore: [], enemies: [], pets: [] };
    if (!parsed) return images;
    issues.push(...parsed.issues);
    const sections = (parsed.value ?? {}) as Record<string, unknown>;
    for (const section of IMAGE_SECTIONS) {
        images[section] = imageLinksOf(sections[section]);
    }
    return images;
}

// la validazione dello snapshot del mondo è dei controlli offline (piano 11-04): qui si legge soltanto
function loadWorld(dir: string, issues: ContentIssue[]): WorldCity[] | null {
    const parsed = readYaml(dir, WORLD_FILE);
    if (!parsed) return null;
    issues.push(...parsed.issues);
    return Array.isArray(parsed.value) ? (parsed.value as WorldCity[]) : null;
}

export function loadContentTree(dir: string): ContentTree {
    const issues: ContentIssue[] = [];
    const config = loadConfig(dir, issues);
    const entries = Object.fromEntries(
        CONTENT_COLLECTIONS.map((collection) => [
            collection,
            loadFolder(dir, COLLECTION_DIRS[collection], issues),
        ]),
    ) as Record<ContentCollection, LoadedEntry[]>;
    return {
        dir,
        entries,
        fixes: loadFolder(dir, FIXES_DIR, issues),
        images: loadImages(dir, issues),
        world: loadWorld(dir, issues),
        config,
        issues,
    };
}
