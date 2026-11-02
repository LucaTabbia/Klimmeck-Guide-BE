import { Db, Document, ObjectId } from 'mongodb';
import { ContentIndex } from 'src/content/checking/content-index';
import {
    ContentCollection,
    ContentTree,
} from 'src/content/loading/content-tree';
import { FIXED_QUEST_TYPES } from 'src/content/rules/content-config';
import { DivergenceRef, OrphanRef } from './content-report';

// D-05: per le quest solo le fisse aperte; generate, aid, story, worldMission e concluse non sono mai orfane
const ORPHAN_SCOPE: Readonly<Record<ContentCollection, Document>> = {
    lore: {},
    spells: {},
    equipmentitems: {},
    lootitems: {},
    enemies: {},
    pets: {},
    quests: {
        'infos.type': { $in: [...FIXED_QUEST_TYPES] },
        concludedAt: null,
    },
};

// il campo a DB che distingue le voci omonime (come il type di indexContent); null = solo il nome
const STORED_TYPE_FIELD: Readonly<Record<ContentCollection, string | null>> = {
    lore: 'type',
    spells: 'useType',
    equipmentitems: 'equipType',
    lootitems: 'effect',
    enemies: null,
    pets: null,
    quests: null,
};

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function storedNameOf(
    collection: ContentCollection,
    doc: Document,
): string | null {
    if (collection === 'quests') {
        return stringOrNull((doc.infos as Document | undefined)?.title);
    }
    return stringOrNull(doc.name);
}

export function knownIdsOf(
    tree: ContentTree,
    collection: ContentCollection,
): ObjectId[] {
    return tree.entries[collection].map(
        (entry) => new ObjectId(String(entry.raw.id)),
    );
}

export async function findOrphans(
    db: Db,
    collection: ContentCollection,
    knownIds: readonly ObjectId[],
): Promise<Document[]> {
    return db
        .collection(collection)
        .find({ ...ORPHAN_SCOPE[collection], _id: { $nin: [...knownIds] } })
        .sort({ _id: 1 })
        .toArray();
}

export function orphanRefOf(
    collection: ContentCollection,
    doc: Document,
): OrphanRef {
    return { id: String(doc._id), name: storedNameOf(collection, doc) };
}

function twinOf(
    index: ContentIndex,
    collection: ContentCollection,
    doc: Document,
): DivergenceRef | null {
    const name = storedNameOf(collection, doc);
    if (name === null) return null;
    const typeField = STORED_TYPE_FIELD[collection];
    const twin = index.entries.find(
        (entry) =>
            entry.collection === collection &&
            entry.name === name &&
            (typeField === null || entry.type === doc[typeField]),
    );
    if (!twin) return null;
    return { collection, id: String(doc._id), name, type: twin.type };
}

// Pitfall 7: un orfano con nome e tipo di una voce dei file fa pensare a un ambiente con id diversi
export function divergencesOf(
    index: ContentIndex,
    collection: ContentCollection,
    orphans: readonly Document[],
): DivergenceRef[] {
    if (collection === 'quests') return [];
    return orphans.flatMap((doc) => {
        const twin = twinOf(index, collection, doc);
        return twin ? [twin] : [];
    });
}
