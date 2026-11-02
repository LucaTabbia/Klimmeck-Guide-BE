import { Db, Document, ObjectId } from 'mongodb';
import { checkContent } from 'src/content/checking/check-content';
import { indexContent } from 'src/content/checking/content-index';
import { ContentIssue } from 'src/content/content-issue';
import { deleteQuests } from 'src/content/fixes/delete-quests.fix';
import { BlockedQuest } from 'src/content/fixes/fix-report';
import {
    ContentCollection,
    ContentTree,
} from 'src/content/loading/content-tree';
import { OrphanRef } from './content-report';
import { checkDatabase } from './db-checks';
import { divergencesOf, findOrphans, knownIdsOf, orphanRefOf } from './orphans';

// T-11-34: elenco chiuso, una collezione per corsa; il catalogo resta fuori finché non ci sono le guardie sui riferimenti dei personaggi
export const PRUNABLE_COLLECTIONS: readonly ContentCollection[] = [
    'quests',
    'lore',
];

export interface PruneReport {
    mode: 'prune';
    collection: ContentCollection;
    deleted: OrphanRef[];
    blocked: BlockedQuest[];
    errors: ContentIssue[];
}

const PRUNE_QUESTS_KEY = 'prune-quests';

function pruneIssue(
    message: string,
    entryId: string | null = null,
): ContentIssue {
    return { file: '', line: null, entryId, path: 'collection', message };
}

function refusedCollection(collection: string): ContentIssue {
    return pruneIssue(
        `collezione non ammessa per il prune: ${collection} (ammesse: ${PRUNABLE_COLLECTIONS.join(', ')})`,
    );
}

// HI-01: un perimetro vuoto o più orfani che voci fanno pensare a una cartella o a un database sbagliati
function massDeletionIssues(
    collection: ContentCollection,
    knownCount: number,
    orphanCount: number,
): ContentIssue[] {
    if (knownCount === 0) {
        return [
            pruneIssue(
                `nessuna voce di ${collection} nei file: il prune cancellerebbe tutta la collezione`,
            ),
        ];
    }
    if (orphanCount <= knownCount) return [];
    return [
        pruneIssue(
            `${orphanCount} orfani contro ${knownCount} voci nei file: probabile cartella o database sbagliati`,
        ),
    ];
}

// Pitfall 7: un orfano gemello di una voce dei file è un id divergente, non un documento da cancellare
function divergenceIssues(
    tree: ContentTree,
    collection: ContentCollection,
    orphans: readonly Document[],
): ContentIssue[] {
    return divergencesOf(indexContent(tree), collection, orphans).map((twin) =>
        pruneIssue(
            `probabile divergenza di id: «${twin.name}» ha un altro id nei file`,
            twin.id,
        ),
    );
}

async function pruneDocuments(
    db: Db,
    collection: ContentCollection,
    orphans: readonly Document[],
): Promise<Pick<PruneReport, 'deleted' | 'blocked'>> {
    const ids = orphans.map((doc) => doc._id as ObjectId);
    await db.collection(collection).deleteMany({ _id: { $in: ids } });
    return {
        deleted: orphans.map((doc) => orphanRefOf(collection, doc)),
        blocked: [],
    };
}

// Pitfall 2: le stesse guardie del fix deleteQuests, senza duplicarle
async function pruneQuests(
    db: Db,
    orphans: readonly Document[],
): Promise<Pick<PruneReport, 'deleted' | 'blocked'>> {
    const result = await deleteQuests(
        db,
        {
            key: PRUNE_QUESTS_KEY,
            kind: 'deleteQuests',
            ids: orphans.map((doc) => String(doc._id)),
        },
        'apply',
    );
    const deleted = new Set(result.deleted ?? []);
    return {
        deleted: orphans
            .filter((doc) => deleted.has(String(doc._id)))
            .map((doc) => orphanRefOf('quests', doc)),
        blocked: result.blocked ?? [],
    };
}

// D-05: cancellare è sempre esplicito, col perimetro degli orfani e solo con file e database allineati
export async function pruneCollection(
    db: Db,
    collection: ContentCollection,
    tree: ContentTree,
): Promise<PruneReport> {
    const report: PruneReport = {
        mode: 'prune',
        collection,
        deleted: [],
        blocked: [],
        errors: [],
    };
    if (!PRUNABLE_COLLECTIONS.includes(collection)) {
        return { ...report, errors: [refusedCollection(collection)] };
    }
    const { errors } = checkContent(tree);
    if (errors.length > 0) return { ...report, errors };
    const dbCheck = await checkDatabase(db, tree, 'verify');
    if (dbCheck.errors.length > 0) return { ...report, errors: dbCheck.errors };
    const knownIds = knownIdsOf(tree, collection);
    const orphans = await findOrphans(db, collection, knownIds);
    const refusals = [
        ...massDeletionIssues(collection, knownIds.length, orphans.length),
        ...divergenceIssues(tree, collection, orphans),
    ];
    if (refusals.length > 0) return { ...report, errors: refusals };
    if (orphans.length === 0) return report;
    const outcome =
        collection === 'quests'
            ? await pruneQuests(db, orphans)
            : await pruneDocuments(db, collection, orphans);
    return { ...report, ...outcome };
}
