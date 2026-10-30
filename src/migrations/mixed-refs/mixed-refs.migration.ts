import type { Document } from 'mongodb';
import { MIXED_REF_PATHS, MixedRefPath } from './mixed-ref-paths';
import {
    conversionStage,
    convertibleFilter,
    POI_TYPE_SCALAR_FILTER,
    poiTypeNormalization,
    residualFilter,
} from './mixed-ref-pipelines';

export type MixedRefsMode = 'dry-run' | 'apply' | 'verify';

// la parte del driver che la migrazione usa: la soddisfano sia il Db del driver diretto sia quello annidato nella connessione dell'app
export interface ReferenceCollection {
    updateMany(
        filter: Document,
        update: Document[],
    ): Promise<{ modifiedCount: number }>;
    countDocuments(filter: Document): Promise<number>;
}

export interface ReferenceDatabase {
    collection(name: string): ReferenceCollection;
    admin(): { serverInfo(): Promise<Document> };
}

export interface MixedRefPathReport {
    collection: string;
    path: string;
    residual: number;
    modified: number;
}

export interface MixedRefsReport {
    mode: MixedRefsMode;
    serverVersion: string;
    paths: MixedRefPathReport[];
    poiTypeScalars: number;
    poiTypeNormalized: number;
}

const POINTS_OF_INTEREST = 'pointsofinterest';
const MINIMUM_MAJOR = 4;
const MINIMUM_MINOR = 2;

// pipeline di update e conversioni condizionali esistono solo da MongoDB 4.2 (A1): sotto si ferma prima di scrivere
export class UnsupportedMongoVersionError extends Error {
    constructor() {
        super('MongoDB >= 4.2 is required for the reference migration');
        this.name = 'UnsupportedMongoVersionError';
    }
}

function isSupported(version: string): boolean {
    const [major, minor] = version.split('.').map(Number);
    return (
        major > MINIMUM_MAJOR ||
        (major === MINIMUM_MAJOR && minor >= MINIMUM_MINOR)
    );
}

async function supportedServerVersion(db: ReferenceDatabase): Promise<string> {
    const { version } = await db.admin().serverInfo();
    const serverVersion = String(version);
    if (!isSupported(serverVersion)) throw new UnsupportedMongoVersionError();
    return serverVersion;
}

function pathOf(ref: MixedRefPath): string {
    return ref.key ? `${ref.path}.${ref.key}` : ref.path;
}

async function convert(
    db: ReferenceDatabase,
    ref: MixedRefPath,
): Promise<number> {
    const { modifiedCount } = await db
        .collection(ref.collection)
        .updateMany(convertibleFilter(ref), [conversionStage(ref)]);
    return modifiedCount;
}

async function residualOf(
    db: ReferenceDatabase,
    ref: MixedRefPath,
): Promise<number> {
    return db.collection(ref.collection).countDocuments(residualFilter(ref));
}

async function migratePath(
    db: ReferenceDatabase,
    ref: MixedRefPath,
    mode: MixedRefsMode,
): Promise<MixedRefPathReport> {
    const modified = mode === 'apply' ? await convert(db, ref) : 0;
    const residual = await residualOf(db, ref);
    return {
        collection: ref.collection,
        path: pathOf(ref),
        residual,
        modified,
    };
}

async function normalizePoiTypes(
    db: ReferenceDatabase,
    mode: MixedRefsMode,
): Promise<Pick<MixedRefsReport, 'poiTypeScalars' | 'poiTypeNormalized'>> {
    const collection = db.collection(POINTS_OF_INTEREST);
    const normalized =
        mode === 'apply'
            ? await collection.updateMany(POI_TYPE_SCALAR_FILTER, [
                  poiTypeNormalization,
              ])
            : undefined;
    return {
        poiTypeScalars: await collection.countDocuments(POI_TYPE_SCALAR_FILTER),
        poiTypeNormalized: normalized?.modifiedCount ?? 0,
    };
}

// i ref stringa ancora convertibili per percorso: la stessa misura di --verify, letta anche dal verificatore al boot
export async function countResidualRefs(
    db: ReferenceDatabase,
): Promise<MixedRefPathReport[]> {
    const counts: MixedRefPathReport[] = [];
    for (const ref of MIXED_REF_PATHS) {
        counts.push(await migratePath(db, ref, 'verify'));
    }
    return counts;
}

// driver nativo, nessun cast dello schema: tocca solo le stringhe esadecimali minuscole, quindi una seconda apply non modifica nulla
export async function runMixedRefsMigration(
    db: ReferenceDatabase,
    mode: MixedRefsMode,
): Promise<MixedRefsReport> {
    const serverVersion = await supportedServerVersion(db);
    const paths: MixedRefPathReport[] = [];
    for (const ref of MIXED_REF_PATHS) {
        paths.push(await migratePath(db, ref, mode));
    }
    return {
        mode,
        serverVersion,
        paths,
        ...(await normalizePoiTypes(db, mode)),
    };
}

export function hasResidualRefs(report: MixedRefsReport): boolean {
    return (
        report.poiTypeScalars > 0 ||
        report.paths.some(({ residual }) => residual > 0)
    );
}
