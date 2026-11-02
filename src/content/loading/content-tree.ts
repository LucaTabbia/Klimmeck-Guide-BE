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
    worldEntries: LoadedEntry[];
    config: ContentConfig | null;
    issues: ContentIssue[];
}

const IMAGE_SECTIONS = ['lore', 'enemies', 'pets'] as const;

type ImageSection = (typeof IMAGE_SECTIONS)[number];

function isImageSection(name: string): name is ImageSection {
    return (IMAGE_SECTIONS as readonly string[]).includes(name);
}

function isMapping(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fileIssue(
    file: string,
    message: string,
    path: string = '',
): ContentIssue {
    return { file, line: null, entryId: null, path, message };
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

// i link con la forma giusta ma valori sbagliati restano: li controlla la validazione delle voci (ImageLinkEntry)
function imageLinksOf(
    section: ImageSection,
    value: unknown,
    issues: ContentIssue[],
): ImageLink[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        issues.push(fileIssue(IMAGES_FILE, 'deve essere una lista', section));
        return [];
    }
    return value.flatMap((link: unknown, index) => {
        if (isMapping(link)) return [link as unknown as ImageLink];
        issues.push(
            fileIssue(
                IMAGES_FILE,
                'la voce non è una mappa chiave: valore',
                `${section}.${index}`,
            ),
        );
        return [];
    });
}

function loadImages(dir: string, issues: ContentIssue[]): ImagesFile {
    const parsed = readYaml(dir, IMAGES_FILE);
    const images: ImagesFile = { lore: [], enemies: [], pets: [] };
    if (!parsed) return images;
    issues.push(...parsed.issues);
    const sections = isMapping(parsed.value) ? parsed.value : {};
    for (const name of Object.keys(sections)) {
        if (isImageSection(name)) {
            images[name] = imageLinksOf(name, sections[name], issues);
            continue;
        }
        issues.push(fileIssue(IMAGES_FILE, 'sezione sconosciuta', name));
    }
    return images;
}

interface LoadedWorld {
    world: WorldCity[] | null;
    worldEntries: LoadedEntry[];
}

// qui si legge soltanto: le voci con la loro riga passano poi dalla validazione (WorldCityEntry)
function loadWorld(dir: string, issues: ContentIssue[]): LoadedWorld {
    const parsed = readYaml(dir, WORLD_FILE);
    if (!parsed) return { world: null, worldEntries: [] };
    issues.push(...parsed.issues);
    if (!Array.isArray(parsed.value)) {
        if (parsed.issues.length === 0) {
            issues.push(
                fileIssue(WORLD_FILE, 'il file deve essere una lista di voci'),
            );
        }
        return { world: null, worldEntries: [] };
    }
    return {
        world: parsed.value as WorldCity[],
        worldEntries: parsed.entries,
    };
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
        ...loadWorld(dir, issues),
        config,
        issues,
    };
}
