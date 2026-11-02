import { Db, Document, ObjectId } from 'mongodb';
import { ContentCheck } from 'src/content/checking/check-content';
import { ContentIssue } from 'src/content/content-issue';
import {
    ContentTree,
    WORLD_FILE,
    WorldCity,
    WorldPoi,
} from 'src/content/loading/content-tree';
import { CityType } from 'src/models/enums/city-type.enum';
import { PoiType } from 'src/models/enums/poi-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { sameBson } from './bson-diff';
import { ContentMode } from './content-report';

// i problemi trovati a DB non hanno un file: il report li distingue con questa sorgente
export const DATABASE_SOURCE = '(database)';

interface EnumField {
    collection: string;
    field: string;
    values: readonly string[];
}

// Pitfall 5: un valore fuori enum rompe la serializzazione GraphQL della lista
const ENUM_FIELDS: readonly EnumField[] = [
    {
        collection: 'pointsofinterest',
        field: 'type',
        values: Object.values(PoiType),
    },
    { collection: 'cities', field: 'type', values: Object.values(CityType) },
    {
        collection: 'quests',
        field: 'infos.type',
        values: Object.values(QuestType),
    },
];

interface SnapshotContext {
    lines: ReadonlyMap<string, number>;
    cities: ReadonlyMap<string, Document>;
    pois: ReadonlyMap<string, Document>;
}

const emptyCheck = (): ContentCheck => ({ errors: [], warnings: [] });

function mergeChecks(checks: readonly ContentCheck[]): ContentCheck {
    return {
        errors: checks.flatMap((check) => check.errors),
        warnings: checks.flatMap((check) => check.warnings),
    };
}

async function storedById(
    db: Db,
    collection: string,
    hexes: readonly string[],
): Promise<Map<string, Document>> {
    const ids = hexes.map((hex) => new ObjectId(hex));
    const stored = await db
        .collection(collection)
        .find({ _id: { $in: ids } })
        .toArray();
    return new Map(stored.map((doc) => [doc._id.toHexString(), doc]));
}

function snapshotLinesOf(tree: ContentTree): Map<string, number> {
    return new Map(
        tree.worldEntries.map((entry) => [String(entry.raw.id), entry.line]),
    );
}

function snapshotIssue(
    context: SnapshotContext,
    city: WorldCity,
    entryId: string,
    path: string,
    message: string,
): ContentIssue {
    return {
        file: WORLD_FILE,
        line: context.lines.get(city.id) ?? null,
        entryId,
        path,
        message,
    };
}

function misaligned(field: string, stored: unknown, expected: unknown): string {
    return `snapshot non allineato: ${field} a DB «${JSON.stringify(stored)}», nei file «${JSON.stringify(expected)}»`;
}

const REFRESH_SNAPSHOT = `rinfrescare ${WORLD_FILE} con --export`;

// i ref legacy possono essere stringhe esadecimali (04 Pitfall 1): si confrontano come esadecimale
function refHexOf(value: unknown): string | null {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value === 'string') return value;
    return value == null ? null : JSON.stringify(value);
}

function sortedRefHexes(value: unknown): (string | null)[] {
    return (Array.isArray(value) ? value : []).map(refHexOf).sort();
}

// marker e appartenenza dei POI reggono le regole offline delle quest: una differenza è un errore
function membershipIssue(
    context: SnapshotContext,
    city: WorldCity,
    entryId: string,
    path: string,
    stored: unknown,
    expected: unknown,
): ContentIssue {
    return snapshotIssue(
        context,
        city,
        entryId,
        path,
        `${misaligned(path, stored, expected)}: ${REFRESH_SNAPSHOT}`,
    );
}

function poiCheck(
    context: SnapshotContext,
    city: WorldCity,
    poi: WorldPoi,
): ContentCheck {
    const check = emptyCheck();
    const stored = context.pois.get(poi.id);
    if (!stored) {
        check.errors.push(
            snapshotIssue(
                context,
                city,
                poi.id,
                'pointsOfInterest',
                `punto di interesse dello snapshot assente dal database (città ${city.name})`,
            ),
        );
        return check;
    }
    const storedCity = refHexOf(stored.city);
    if (storedCity !== city.id) {
        check.errors.push(
            membershipIssue(
                context,
                city,
                poi.id,
                'pointsOfInterest.city',
                storedCity,
                city.id,
            ),
        );
    }
    if (!sameBson(stored.type, poi.type)) {
        check.warnings.push(
            snapshotIssue(
                context,
                city,
                poi.id,
                'pointsOfInterest.type',
                misaligned('type', stored.type, poi.type),
            ),
        );
    }
    return check;
}

function cityMembershipIssues(
    context: SnapshotContext,
    city: WorldCity,
    stored: Document,
): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const marker = refHexOf(stored.markerLocation);
    if (marker !== city.markerLocation) {
        issues.push(
            membershipIssue(
                context,
                city,
                city.id,
                'markerLocation',
                marker,
                city.markerLocation,
            ),
        );
    }
    const storedPois = sortedRefHexes(stored.pointsOfInterest);
    const expectedPois = city.pointsOfInterest.map((poi) => poi.id).sort();
    if (!sameBson(storedPois, expectedPois)) {
        issues.push(
            membershipIssue(
                context,
                city,
                city.id,
                'pointsOfInterest',
                storedPois,
                expectedPois,
            ),
        );
    }
    return issues;
}

function cityCheck(context: SnapshotContext, city: WorldCity): ContentCheck {
    const stored = context.cities.get(city.id);
    if (!stored) {
        return {
            errors: [
                snapshotIssue(
                    context,
                    city,
                    city.id,
                    '',
                    `città dello snapshot assente dal database: ${city.name}`,
                ),
            ],
            warnings: [],
        };
    }
    const warnings = (['name', 'type'] as const)
        .filter((field) => stored[field] !== city[field])
        .map((field) =>
            snapshotIssue(
                context,
                city,
                city.id,
                field,
                misaligned(field, stored[field], city[field]),
            ),
        );
    return { errors: cityMembershipIssues(context, city, stored), warnings };
}

// T-11-37: città e POI dello snapshot devono esistere con gli stessi id
async function snapshotCheck(db: Db, tree: ContentTree): Promise<ContentCheck> {
    const world = tree.world ?? [];
    const poisOf = (city: WorldCity) => city.pointsOfInterest;
    const context: SnapshotContext = {
        lines: snapshotLinesOf(tree),
        cities: await storedById(
            db,
            'cities',
            world.map((city) => city.id),
        ),
        pois: await storedById(
            db,
            'pointsofinterest',
            world.flatMap(poisOf).map((poi) => poi.id),
        ),
    };
    return mergeChecks(
        world.flatMap((city) => [
            cityCheck(context, city),
            ...poisOf(city).map((poi) => poiCheck(context, city, poi)),
        ]),
    );
}

function valueAt(doc: Document, path: string): unknown {
    return path
        .split('.')
        .reduce<unknown>(
            (value, key) =>
                value && typeof value === 'object'
                    ? (value as Document)[key]
                    : undefined,
            doc,
        );
}

function storedValuesOf(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    return value == null ? [] : [value];
}

function unknownValuesOf(doc: Document, field: EnumField): string[] {
    return storedValuesOf(valueAt(doc, field.field))
        .filter(
            (value) =>
                typeof value !== 'string' || !field.values.includes(value),
        )
        .map((value) =>
            typeof value === 'string' ? value : JSON.stringify(value),
        );
}

async function enumIssues(db: Db, field: EnumField): Promise<ContentIssue[]> {
    const docs = await db
        .collection(field.collection)
        .find({}, { projection: { [field.field]: 1 } })
        .toArray();
    return docs.flatMap((doc) => {
        const unknown = unknownValuesOf(doc, field);
        if (unknown.length === 0) return [];
        return [
            {
                file: DATABASE_SOURCE,
                line: null,
                entryId: doc._id.toHexString(),
                path: `${field.collection}.${field.field}`,
                message: `valori fuori enum: ${unknown.map((value) => `«${value}»`).join(', ')}`,
            },
        ];
    });
}

// in apply i tipi POI sporchi li corregge il fix normalizePoiTypes: lì sono solo avvisi
async function enumCheck(db: Db, mode: ContentMode): Promise<ContentCheck> {
    const issues: ContentIssue[] = [];
    for (const field of ENUM_FIELDS)
        issues.push(...(await enumIssues(db, field)));
    return mode === 'verify'
        ? { errors: issues, warnings: [] }
        : { errors: [], warnings: issues };
}

export async function checkDatabase(
    db: Db,
    tree: ContentTree,
    mode: ContentMode,
): Promise<ContentCheck> {
    return mergeChecks([
        await snapshotCheck(db, tree),
        await enumCheck(db, mode),
    ]);
}
