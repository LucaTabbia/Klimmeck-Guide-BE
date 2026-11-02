import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Db } from 'mongodb';
import {
    enemyEntryOf,
    equipmentEntryOf,
    ExportedEntry,
    hexOf,
    lootEntryOf,
    loreEntryOf,
    petEntryOf,
    spellEntryOf,
    StoredDocument,
    worldCityOf,
} from 'src/content/export/entry-from-document';
import { writeEntriesFile } from 'src/content/export/yaml-writer';
import { FIXES_DIR, WORLD_FILE } from 'src/content/loading/content-tree';

export const DELETE_TEST_QUESTS_FILE = `${FIXES_DIR}/delete-test-quests.yaml`;
export const DELETE_TEST_QUESTS_KEY = 'delete-talmvere-test-quests';

const CATALOG_COLLECTIONS = [
    'lore',
    'enemies',
    'pets',
    'spells',
    'equipmentitems',
    'lootitems',
] as const;

type CatalogCollection = (typeof CATALOG_COLLECTIONS)[number];

type SnapshotCollection =
    | CatalogCollection
    | 'cities'
    | 'pointsofinterest'
    | 'quests';

// T-11-38: dalle quest escono solo id, tipo, titolo e marker; mai personaggi, utenti o sessioni
const QUEST_PROJECTION = {
    _id: 1,
    'infos.type': 1,
    'infos.title': 1,
    'infos.markerLocation': 1,
};

// un valore del DB diventa nome di file solo se è un identificatore semplice (niente percorsi)
const SAFE_FILE_NAME = /^[A-Za-z0-9_-]+$/;
const UNNAMED_GROUP = 'senza-tipo';

type EntryObject = Record<string, unknown>;
type DbSnapshot = Record<SnapshotCollection, StoredDocument[]>;

export class ExportDirNotEmptyError extends Error {
    constructor(readonly dir: string) {
        super(`La cartella di export non è vuota: ${dir}`);
        this.name = 'ExportDirNotEmptyError';
    }
}

export interface ExportReport {
    mode: 'export';
    files: { file: string; entries: number }[];
    normalized: { collection: string; id: string; fields: string[] }[];
    droppedFields: Record<string, string[]>;
    counts: Record<SnapshotCollection, number>;
}

interface ExportFile {
    file: string;
    entries: EntryObject[];
}

interface CatalogExport {
    files: ExportFile[];
    normalized: ExportReport['normalized'];
    droppedFields: Record<string, string[]>;
}

// T-11-39: i file curati non si sovrascrivono mai
function prepareEmptyDir(dir: string): void {
    if (existsSync(dir) && readdirSync(dir).length > 0) {
        throw new ExportDirNotEmptyError(dir);
    }
    mkdirSync(dir, { recursive: true });
}

async function readCollection(
    db: Db,
    collection: SnapshotCollection,
): Promise<StoredDocument[]> {
    const projection = collection === 'quests' ? QUEST_PROJECTION : undefined;
    return db
        .collection(collection)
        .find({}, { projection })
        .sort({ _id: 1 })
        .toArray();
}

async function readSnapshot(db: Db): Promise<DbSnapshot> {
    const collections: SnapshotCollection[] = [
        ...CATALOG_COLLECTIONS,
        'cities',
        'pointsofinterest',
        'quests',
    ];
    const documents = await Promise.all(
        collections.map((collection) => readCollection(db, collection)),
    );
    return Object.fromEntries(
        collections.map((collection, index) => [collection, documents[index]]),
    ) as DbSnapshot;
}

const idOf = (doc: StoredDocument): string => hexOf(doc._id) as string;

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value : '';

function groupFile(folder: string, value: unknown): string {
    const name = textOf(value);
    return `${folder}/${SAFE_FILE_NAME.test(name) ? name : UNNAMED_GROUP}.yaml`;
}

// la prima città che la collega vince, nell'ordine di _id (D-23)
function cityByLoreOf(cities: readonly StoredDocument[]): Map<string, string> {
    const cityByLore = new Map<string, string>();
    for (const city of cities) {
        const lore = hexOf(city.relatedLore);
        if (typeof lore === 'string' && !cityByLore.has(lore)) {
            cityByLore.set(lore, idOf(city));
        }
    }
    return cityByLore;
}

// il POI appartiene alla città che lo elenca; altrimenti a quella del suo campo `city`
function cityByPoiOf(snapshot: DbSnapshot): Map<string, StoredDocument> {
    const cityById = new Map(snapshot.cities.map((city) => [idOf(city), city]));
    const cityByPoi = new Map<string, StoredDocument>();
    for (const city of snapshot.cities) {
        const pois = Array.isArray(city.pointsOfInterest)
            ? city.pointsOfInterest
            : [];
        for (const poi of pois) {
            const poiId = textOf(hexOf(poi));
            if (!cityByPoi.has(poiId)) cityByPoi.set(poiId, city);
        }
    }
    for (const poi of snapshot.pointsofinterest) {
        const city = cityById.get(textOf(hexOf(poi.city)));
        if (city && !cityByPoi.has(idOf(poi))) cityByPoi.set(idOf(poi), city);
    }
    return cityByPoi;
}

function groupedFiles(
    entries: readonly { file: string; entry: EntryObject }[],
): ExportFile[] {
    const files = new Map<string, EntryObject[]>();
    for (const { file, entry } of entries) {
        files.set(file, [...(files.get(file) ?? []), entry]);
    }
    return [...files].map(([file, grouped]) => ({ file, entries: grouped }));
}

type CatalogExporter = (doc: StoredDocument) => {
    file: string;
    exported: ExportedEntry;
};

function catalogExporters(
    cityByLore: ReadonlyMap<string, string>,
): Record<CatalogCollection, CatalogExporter> {
    return {
        lore: (doc) => ({
            file:
                doc.type === 'city'
                    ? 'lore/citta-esistenti.yaml'
                    : 'lore/esistenti.yaml',
            exported: loreEntryOf(doc, cityByLore),
        }),
        enemies: (doc) => ({
            file: 'enemies/esistenti.yaml',
            exported: enemyEntryOf(doc),
        }),
        pets: (doc) => ({
            file: 'pets/cavalcature.yaml',
            exported: petEntryOf(doc),
        }),
        spells: (doc) => ({
            file: groupFile('spells', doc.useType),
            exported: spellEntryOf(doc),
        }),
        equipmentitems: (doc) => ({
            file: groupFile('equipment', doc.equipType),
            exported: equipmentEntryOf(doc),
        }),
        lootitems: (doc) => ({
            file: groupFile('loot', doc.effect),
            exported: lootEntryOf(doc),
        }),
    };
}

function exportCatalog(snapshot: DbSnapshot): CatalogExport {
    const exporters = catalogExporters(cityByLoreOf(snapshot.cities));
    const result: CatalogExport = {
        files: [],
        normalized: [],
        droppedFields: {},
    };
    for (const collection of CATALOG_COLLECTIONS) {
        const exported = snapshot[collection].map(exporters[collection]);
        const dropped = new Set<string>();
        for (const { exported: entry } of exported) {
            entry.dropped.forEach((field) => dropped.add(field));
            if (entry.normalized.length === 0) continue;
            result.normalized.push({
                collection,
                id: entry.entry.id as string,
                fields: entry.normalized,
            });
        }
        result.droppedFields[collection] = [...dropped].sort();
        result.files.push(
            ...groupedFiles(
                exported.map(({ file, exported: entry }) => ({
                    file,
                    entry: entry.entry,
                })),
            ),
        );
    }
    return result;
}

const byTypeThenName = (a: StoredDocument, b: StoredDocument): number =>
    textOf(a.type).localeCompare(textOf(b.type)) ||
    textOf(a.name).localeCompare(textOf(b.name));

function worldFile(
    snapshot: DbSnapshot,
    cityByPoi: ReadonlyMap<string, StoredDocument>,
): ExportFile {
    const entries = [...snapshot.cities].sort(byTypeThenName).map((city) =>
        worldCityOf(
            city,
            snapshot.pointsofinterest.filter(
                (poi) => cityByPoi.get(idOf(poi)) === city,
            ),
        ),
    );
    return { file: WORLD_FILE, entries };
}

// D-05: tutte le quest presenti finiscono nella lista da rivedere a mano prima della --apply
function deleteQuestsFile(snapshot: DbSnapshot): ExportFile {
    const ids = snapshot.quests.map(idOf);
    const entries =
        ids.length === 0
            ? []
            : [{ key: DELETE_TEST_QUESTS_KEY, kind: 'deleteQuests', ids }];
    return { file: DELETE_TEST_QUESTS_FILE, entries };
}

const infosOf = (quest: StoredDocument): StoredDocument =>
    (quest.infos ?? {}) as StoredDocument;

function questLabel(
    quest: StoredDocument,
    cityByPoi: ReadonlyMap<string, StoredDocument>,
): string {
    const infos = infosOf(quest);
    const label = `[${textOf(infos.type)}] ${textOf(infos.title)}`;
    const city = cityByPoi.get(textOf(hexOf(infos.markerLocation)));
    return city ? `${label} — ${textOf(city.name)}` : label;
}

function poiLabel(
    poi: StoredDocument,
    city: StoredDocument | undefined,
): string {
    const types = Array.isArray(poi.type) ? poi.type.map(textOf) : [];
    return `${textOf(city?.name)} — POI ${types.join(', ')}`;
}

// D-02: i nomi accanto agli id vengono da tutte le collezioni esportate, città e POI compresi
function namesByIdOf(
    snapshot: DbSnapshot,
    cityByPoi: ReadonlyMap<string, StoredDocument>,
): Map<string, string> {
    const names = new Map<string, string>();
    const add = (id: string, name: string) => {
        if (name && !names.has(id)) names.set(id, name);
    };
    for (const collection of [...CATALOG_COLLECTIONS, 'cities'] as const) {
        snapshot[collection].forEach((doc) => add(idOf(doc), textOf(doc.name)));
    }
    snapshot.pointsofinterest.forEach((poi) =>
        add(idOf(poi), poiLabel(poi, cityByPoi.get(idOf(poi)))),
    );
    snapshot.quests.forEach((quest) =>
        add(idOf(quest), questLabel(quest, cityByPoi)),
    );
    return names;
}

const headerOf = (now: Date): string =>
    `Esportato da --export il ${now.toISOString().slice(0, 10)}: da qui in poi il file è la fonte di verità (D-04)`;

function countsOf(snapshot: DbSnapshot): Record<SnapshotCollection, number> {
    return Object.fromEntries(
        Object.entries(snapshot).map(([collection, documents]) => [
            collection,
            documents.length,
        ]),
    ) as Record<SnapshotCollection, number>;
}

// T-11-40: sola lettura sul DB; scrive soltanto file nella cartella indicata
export async function exportContent(
    db: Db,
    dir: string,
    now: Date = new Date(),
): Promise<ExportReport> {
    prepareEmptyDir(dir);
    const snapshot = await readSnapshot(db);
    const cityByPoi = cityByPoiOf(snapshot);
    const catalog = exportCatalog(snapshot);
    const files = [
        ...catalog.files,
        worldFile(snapshot, cityByPoi),
        deleteQuestsFile(snapshot),
    ].sort((a, b) => a.file.localeCompare(b.file));
    const namesById = namesByIdOf(snapshot, cityByPoi);
    const header = headerOf(now);
    for (const { file, entries } of files) {
        writeEntriesFile(join(dir, file), entries, namesById, header);
    }
    return {
        mode: 'export',
        files: files.map(({ file, entries }) => ({
            file,
            entries: entries.length,
        })),
        normalized: catalog.normalized,
        droppedFields: catalog.droppedFields,
        counts: countsOf(snapshot),
    };
}
