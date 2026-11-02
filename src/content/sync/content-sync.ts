import { AnyBulkWriteOperation, Db, Document, ObjectId } from 'mongodb';
import { checkContent } from 'src/content/checking/check-content';
import { indexContent } from 'src/content/checking/content-index';
import { ContentIssue } from 'src/content/content-issue';
import { FixMode, FixReport } from 'src/content/fixes/fix-report';
import { runFixes } from 'src/content/fixes/fix-runner';
import type { FixKind } from 'src/content/schema/fix.content';
import {
    COLLECTION_DIRS,
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
} from 'src/content/loading/content-tree';
import {
    CityLoreUpdate,
    MappedDocument,
    mapContentTree,
} from 'src/content/mapping/map-content';
import { changedFields, sameBson } from './bson-diff';
import {
    CityLoreReport,
    ContentMode,
    ContentReport,
    emptyContentReport,
} from './content-report';
import { checkDatabase, DATABASE_SOURCE } from './db-checks';
import { divergencesOf, findOrphans, knownIdsOf, orphanRefOf } from './orphans';
import { cityLoreOp, upsertOp } from './upsert-ops';

interface CollectionPlan {
    collection: ContentCollection;
    ops: AnyBulkWriteOperation[];
    inserted: number;
    modified: number;
    unchanged: number;
}

interface CityLorePlan {
    ops: AnyBulkWriteOperation[];
    report: CityLoreReport;
}

// i fix che toccano una collezione gestita contano nel suo report
const FIX_COLLECTIONS: Readonly<Partial<Record<FixKind, ContentCollection>>> = {
    deleteQuests: 'quests',
    unsetLoreUnlocked: 'lore',
};

// Pitfall 3: senza promozione un double resta Double e un int32 resta Int32, come li vede il server
const STORED_AS_SENT = { promoteValues: false } as const;

async function storedDocuments(
    db: Db,
    collection: string,
    ids: readonly ObjectId[],
): Promise<Map<string, Document>> {
    if (ids.length === 0) return new Map();
    const stored = await db
        .collection(collection)
        .find({ _id: { $in: [...ids] } }, STORED_AS_SENT)
        .toArray();
    return new Map(stored.map((doc) => [doc._id.toHexString(), doc]));
}

// D-01: il diff BSON prevede esattamente cosa farebbe il server; si scrivono solo i documenti diversi
async function planCollection(
    db: Db,
    collection: ContentCollection,
    documents: readonly MappedDocument[],
): Promise<CollectionPlan> {
    const plan: CollectionPlan = {
        collection,
        ops: [],
        inserted: 0,
        modified: 0,
        unchanged: 0,
    };
    const stored = await storedDocuments(
        db,
        collection,
        documents.map((doc) => doc._id),
    );
    for (const doc of documents) {
        const current = stored.get(doc._id.toHexString()) ?? null;
        if (changedFields(current, doc.set).length === 0) {
            plan.unchanged += 1;
            continue;
        }
        plan[current ? 'modified' : 'inserted'] += 1;
        plan.ops.push(upsertOp(doc._id, doc.set, doc.setOnInsert));
    }
    return plan;
}

async function planCollections(
    db: Db,
    documents: Record<ContentCollection, MappedDocument[]>,
): Promise<CollectionPlan[]> {
    const plans: CollectionPlan[] = [];
    for (const collection of CONTENT_COLLECTIONS) {
        plans.push(await planCollection(db, collection, documents[collection]));
    }
    return plans;
}

async function planCityLore(
    db: Db,
    tree: ContentTree,
    links: readonly CityLoreUpdate[],
): Promise<CityLorePlan> {
    const stored = await storedDocuments(
        db,
        'cities',
        links.map((link) => link.cityId),
    );
    const names = new Map(
        (tree.world ?? []).map((city) => [city.id, city.name]),
    );
    const plan: CityLorePlan = {
        ops: [],
        report: { modified: 0, unchanged: 0, missing: [] },
    };
    for (const link of links) {
        const id = link.cityId.toHexString();
        const city = stored.get(id);
        // difesa in profondità: una città assente è già un errore di checkDatabase, qui si elenca e non si scrive
        if (!city) {
            plan.report.missing.push({ id, name: names.get(id) ?? null });
        } else if (sameBson(city.relatedLore, link.relatedLore)) {
            plan.report.unchanged += 1;
        } else {
            plan.report.modified += 1;
            plan.ops.push(cityLoreOp(link.cityId, link.relatedLore));
        }
    }
    return plan;
}

interface WriteCounts {
    inserted: number;
    modified: number;
}

async function bulkWriteOf(
    db: Db,
    collection: string,
    ops: AnyBulkWriteOperation[],
): Promise<WriteCounts> {
    if (ops.length === 0) return { inserted: 0, modified: 0 };
    const result = await db
        .collection(collection)
        .bulkWrite(ops, { ordered: true });
    return { inserted: result.upsertedCount, modified: result.modifiedCount };
}

// il piano è una previsione; una scrittura concorrente o una semantica diversa del server la smentiscono
function outcomeWarnings(
    collection: string,
    planned: WriteCounts,
    written: WriteCounts,
): ContentIssue[] {
    if (sameBson(planned, written)) return [];
    return [
        {
            file: DATABASE_SOURCE,
            line: null,
            entryId: null,
            path: collection,
            message: `esito della scrittura diverso dal piano: inseriti ${written.inserted} (piano ${planned.inserted}), modificati ${written.modified} (piano ${planned.modified})`,
        },
    ];
}

async function writePlanned(
    db: Db,
    collection: string,
    ops: AnyBulkWriteOperation[],
    planned: WriteCounts,
): Promise<ContentIssue[]> {
    const written = await bulkWriteOf(db, collection, ops);
    return outcomeWarnings(collection, planned, written);
}

// ordine D-27: lore → città → magie → equipaggiamento/loot → nemici → pet → quest
async function writeContent(
    db: Db,
    plans: readonly CollectionPlan[],
    cityLore: CityLorePlan,
): Promise<ContentIssue[]> {
    const warnings: ContentIssue[] = [];
    for (const { collection, ops, inserted, modified } of plans) {
        warnings.push(
            ...(await writePlanned(db, collection, ops, {
                inserted,
                modified,
            })),
        );
        if (collection !== 'lore') continue;
        warnings.push(
            ...(await writePlanned(db, 'cities', cityLore.ops, {
                inserted: 0,
                modified: cityLore.report.modified,
            })),
        );
    }
    return warnings;
}

function countErrors(
    report: ContentReport,
    errors: readonly ContentIssue[],
): void {
    report.errors.push(...errors);
    for (const collection of CONTENT_COLLECTIONS) {
        const prefix = `${COLLECTION_DIRS[collection]}/`;
        report.collections[collection].errors += errors.filter((issue) =>
            issue.file.startsWith(prefix),
        ).length;
    }
}

// deleteQuests tocca anche pending e back-link dei POI: nelle quest contano solo quelle cancellate
function documentsOfCollection(fix: FixReport): number {
    return fix.kind === 'deleteQuests'
        ? (fix.deleted ?? []).length
        : fix.touched;
}

function countFixes(report: ContentReport, fixes: readonly FixReport[]): void {
    report.fixes = [...fixes];
    for (const fix of fixes) {
        const collection = FIX_COLLECTIONS[fix.kind];
        if (collection) {
            report.collections[collection].fixes += documentsOfCollection(fix);
        }
    }
}

function countPlans(
    report: ContentReport,
    plans: readonly CollectionPlan[],
): void {
    for (const { collection, inserted, modified, unchanged } of plans) {
        Object.assign(report.collections[collection], {
            inserted,
            modified,
            unchanged,
        });
    }
}

// D-05: gli orfani si elencano e basta; Pitfall 7: le probabili divergenze di id si segnalano
async function listOrphans(
    db: Db,
    tree: ContentTree,
    report: ContentReport,
): Promise<void> {
    const index = indexContent(tree);
    for (const collection of CONTENT_COLLECTIONS) {
        const orphans = await findOrphans(
            db,
            collection,
            knownIdsOf(tree, collection),
        );
        report.collections[collection].orphans = orphans.map((doc) =>
            orphanRefOf(collection, doc),
        );
        report.probableIdDivergence.push(
            ...divergencesOf(index, collection, orphans),
        );
    }
}

// con un errore la corsa resta di sola lettura: i fix si mostrano come in dry-run
function fixModeOf(mode: ContentMode, canWrite: boolean): FixMode {
    if (mode !== 'apply') return mode;
    return canWrite ? 'apply' : 'dry-run';
}

// D-28: file e DB si controllano tutti prima della prima scrittura
export async function runContent(
    db: Db,
    mode: ContentMode,
    tree: ContentTree,
): Promise<ContentReport> {
    const report = emptyContentReport(mode);
    const fileCheck = checkContent(tree);
    report.warnings.push(...fileCheck.warnings);
    if (fileCheck.errors.length > 0) {
        countErrors(report, fileCheck.errors);
        return report;
    }
    const mapped = mapContentTree(tree);
    const dbCheck = await checkDatabase(db, tree, mode);
    report.warnings.push(...dbCheck.warnings);
    countErrors(report, dbCheck.errors);
    const plans = await planCollections(db, mapped.documents);
    const cityLore = await planCityLore(db, tree, mapped.cityLore);
    const canWrite = mode === 'apply' && report.errors.length === 0;
    if (canWrite)
        report.warnings.push(...(await writeContent(db, plans, cityLore)));
    countPlans(report, plans);
    report.cities.relatedLore = cityLore.report;
    countFixes(
        report,
        await runFixes(db, tree.fixes, fixModeOf(mode, canWrite)),
    );
    await listOrphans(db, tree, report);
    return report;
}
