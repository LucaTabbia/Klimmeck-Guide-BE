import { ContentIssue } from 'src/content/content-issue';
import { FixMode, FixReport } from 'src/content/fixes/fix-report';
import {
    CONTENT_COLLECTIONS,
    ContentCollection,
} from 'src/content/loading/content-tree';

// in 'dry-run' e 'verify' inserted/modified significano «da inserire»/«da modificare»
export type ContentMode = FixMode;

export interface OrphanRef {
    id: string;
    name: string | null;
}

export interface CollectionReport {
    inserted: number;
    modified: number;
    unchanged: number;
    orphans: OrphanRef[];
    fixes: number;
    errors: number;
}

export interface DivergenceRef {
    collection: ContentCollection;
    id: string;
    name: string;
    type: string | null;
}

export interface CityLoreReport {
    modified: number;
    unchanged: number;
    missing: OrphanRef[];
}

export interface ContentReport {
    mode: ContentMode;
    collections: Record<ContentCollection, CollectionReport>;
    cities: { relatedLore: CityLoreReport };
    fixes: FixReport[];
    errors: ContentIssue[];
    warnings: ContentIssue[];
    probableIdDivergence: DivergenceRef[];
}

export function emptyCollectionReport(): CollectionReport {
    return {
        inserted: 0,
        modified: 0,
        unchanged: 0,
        orphans: [],
        fixes: 0,
        errors: 0,
    };
}

export function emptyContentReport(mode: ContentMode): ContentReport {
    return {
        mode,
        collections: Object.fromEntries(
            CONTENT_COLLECTIONS.map((collection) => [
                collection,
                emptyCollectionReport(),
            ]),
        ) as Record<ContentCollection, CollectionReport>,
        cities: { relatedLore: { modified: 0, unchanged: 0, missing: [] } },
        fixes: [],
        errors: [],
        warnings: [],
        probableIdDivergence: [],
    };
}

const hasBlockedFix = (report: ContentReport): boolean =>
    report.fixes.some((fix) => fix.status === 'blocked');

const hasPendingFix = (report: ContentReport): boolean =>
    report.fixes.some((fix) => fix.status === 'pending');

const hasDocumentChanges = (report: ContentReport): boolean =>
    Object.values(report.collections).some(
        (collection) => collection.inserted > 0 || collection.modified > 0,
    );

const hasCityChanges = (report: ContentReport): boolean =>
    report.cities.relatedLore.modified > 0 ||
    report.cities.relatedLore.missing.length > 0;

export function hasErrors(report: ContentReport): boolean {
    return report.errors.length > 0 || hasBlockedFix(report);
}

// orfani e warning non sono deriva (D-05): si elencano e basta
export function hasDrift(report: ContentReport): boolean {
    return (
        hasErrors(report) ||
        hasDocumentChanges(report) ||
        hasCityChanges(report) ||
        hasPendingFix(report)
    );
}
