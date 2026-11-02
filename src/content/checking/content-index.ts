import {
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
    WorldCity,
    WorldPoi,
} from 'src/content/loading/content-tree';
import { isRecord } from 'src/content/loading/records';
import { LoadedEntry } from 'src/content/loading/yaml-file';

export interface IndexedEntry {
    collection: ContentCollection;
    id: string;
    name: string | null;
    type: string | null;
    file: string;
    line: number;
    raw: Record<string, unknown>;
}

export interface IndexedPoi {
    poi: WorldPoi;
    cityId: string;
}

export interface ContentIndex {
    entries: IndexedEntry[];
    byCollection: Record<ContentCollection, Map<string, IndexedEntry>>;
    allIds: Map<string, IndexedEntry[]>;
    cities: Map<string, WorldCity>;
    pois: Map<string, IndexedPoi>;
    namesById: Map<string, string>;
}

type Raw = Record<string, unknown>;

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function infosOf(raw: Raw): Raw {
    return isRecord(raw.infos) ? raw.infos : {};
}

// il «type» di ogni collezione è il campo che distingue voci omonime legittime (D-02)
const TYPE_OF: Record<ContentCollection, (raw: Raw) => unknown> = {
    lore: (raw) => raw.type,
    spells: (raw) => raw.useType,
    equipmentitems: (raw) => raw.equipType,
    lootitems: (raw) => raw.effect,
    enemies: (raw) => raw.category,
    pets: () => null,
    quests: (raw) => infosOf(raw).type,
};

function nameOf(collection: ContentCollection, raw: Raw): string | null {
    if (collection === 'quests') return stringOrNull(infosOf(raw).title);
    return stringOrNull(raw.name);
}

function indexedEntryOf(
    collection: ContentCollection,
    entry: LoadedEntry,
): IndexedEntry | null {
    const id = stringOrNull(entry.raw.id);
    if (id === null) return null;
    return {
        collection,
        id,
        name: nameOf(collection, entry.raw),
        type: stringOrNull(TYPE_OF[collection](entry.raw)),
        file: entry.file,
        line: entry.line,
        raw: entry.raw,
    };
}

function citiesOf(tree: ContentTree): WorldCity[] {
    return (tree.world ?? []).filter(
        (city) => isRecord(city) && typeof city.id === 'string',
    );
}

function poisOf(cities: readonly WorldCity[]): Map<string, IndexedPoi> {
    const pois = new Map<string, IndexedPoi>();
    for (const city of cities) {
        const cityPois = Array.isArray(city.pointsOfInterest)
            ? city.pointsOfInterest
            : [];
        for (const poi of cityPois) {
            if (isRecord(poi) && typeof poi.id === 'string') {
                pois.set(poi.id, { poi, cityId: city.id });
            }
        }
    }
    return pois;
}

function groupById(
    entries: readonly IndexedEntry[],
): Map<string, IndexedEntry[]> {
    const allIds = new Map<string, IndexedEntry[]>();
    for (const entry of entries) {
        allIds.set(entry.id, [...(allIds.get(entry.id) ?? []), entry]);
    }
    return allIds;
}

// a parità di id vince la prima voce: i doppioni li segnala il controllo dei duplicati
function byCollectionOf(
    entries: readonly IndexedEntry[],
): Record<ContentCollection, Map<string, IndexedEntry>> {
    const byCollection = Object.fromEntries(
        CONTENT_COLLECTIONS.map((collection) => [collection, new Map()]),
    ) as Record<ContentCollection, Map<string, IndexedEntry>>;
    for (const entry of entries) {
        const map = byCollection[entry.collection];
        if (!map.has(entry.id)) map.set(entry.id, entry);
    }
    return byCollection;
}

function namesOf(
    entries: readonly IndexedEntry[],
    cities: readonly WorldCity[],
): Map<string, string> {
    const names = new Map<string, string>();
    for (const entry of entries) {
        if (entry.name !== null && !names.has(entry.id)) {
            names.set(entry.id, entry.name);
        }
    }
    for (const city of cities) {
        if (typeof city.name === 'string') names.set(city.id, city.name);
    }
    return names;
}

export function indexContent(tree: ContentTree): ContentIndex {
    const entries = CONTENT_COLLECTIONS.flatMap((collection) =>
        tree.entries[collection].flatMap((entry) => {
            const indexed = indexedEntryOf(collection, entry);
            return indexed ? [indexed] : [];
        }),
    );
    const cities = citiesOf(tree);
    return {
        entries,
        byCollection: byCollectionOf(entries),
        allIds: groupById(entries),
        cities: new Map(cities.map((city) => [city.id, city])),
        pois: poisOf(cities),
        namesById: namesOf(entries, cities),
    };
}
