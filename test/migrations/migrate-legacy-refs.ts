import type { Connection } from 'mongoose';
import {
    MixedRefsReport,
    runMixedRefsMigration,
} from 'src/migrations/mixed-refs/mixed-refs.migration';

// ordine di deploy reale (D-17d): il dato legacy passa dalla migrazione prima di essere letto
export function migrateLegacyRefs(
    connection: Connection,
): Promise<MixedRefsReport> {
    const db = connection.db;
    if (!db) throw new Error('Connessione Mongo non aperta');
    return runMixedRefsMigration(db, 'apply');
}
