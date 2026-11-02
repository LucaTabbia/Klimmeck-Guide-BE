import { Db } from 'mongodb';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import type {
    DeleteQuestsFix,
    FixKind,
    NormalizePoiTypesFix,
    RenameCityFix,
    UnsetLoreUnlockedFix,
} from 'src/content/schema/fix.content';
import { fixEntryIssues } from 'src/content/schema/fix.content';
import { FixMode, FixReport } from './fix-report';
import {
    normalizePoiTypes,
    renameCity,
    unsetLoreUnlocked,
} from './poi-and-city-fixes';

type FixHandler = (
    db: Db,
    fix: Record<string, unknown>,
    mode: FixMode,
) => Promise<FixReport>;

// in attesa del motore con le guardie delle corsie: bloccato, nessuna scrittura
function deleteQuestsPending(
    _db: Db,
    fix: DeleteQuestsFix,
): Promise<FixReport> {
    return Promise.resolve({
        key: fix.key,
        kind: fix.kind,
        status: 'blocked',
        touched: 0,
    });
}

const FIX_HANDLERS: Record<FixKind, FixHandler> = {
    normalizePoiTypes: (db, fix, mode) =>
        normalizePoiTypes(db, fix as unknown as NormalizePoiTypesFix, mode),
    renameCity: (db, fix, mode) =>
        renameCity(db, fix as unknown as RenameCityFix, mode),
    deleteQuests: (db, fix) =>
        deleteQuestsPending(db, fix as unknown as DeleteQuestsFix),
    unsetLoreUnlocked: (db, fix, mode) =>
        unsetLoreUnlocked(db, fix as unknown as UnsetLoreUnlockedFix, mode),
};

// difesa in profondità (T-11-25): kind chiuso e target validati anche se il CLI ha già fatto --check
function assertValidFix(fix: LoadedEntry): void {
    const issues = fixEntryIssues(fix);
    if (issues.length === 0) return;
    const messages = issues.map((issue) => issue.message).join('; ');
    throw new Error(
        `Correzione non valida: ${String(fix.raw.key)}: ${messages}`,
    );
}

// nell'ordine dei file e delle voci; scrive solo in 'apply'
export async function runFixes(
    db: Db,
    fixes: readonly LoadedEntry[],
    mode: FixMode,
): Promise<FixReport[]> {
    fixes.forEach(assertValidFix);
    const reports: FixReport[] = [];
    for (const fix of fixes) {
        const handler = FIX_HANDLERS[fix.raw.kind as FixKind];
        reports.push(await handler(db, fix.raw, mode));
    }
    return reports;
}
