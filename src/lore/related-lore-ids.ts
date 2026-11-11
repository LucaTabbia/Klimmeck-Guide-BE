import type { Types } from 'mongoose';
import { isObjectId, refIdOf } from 'src/mongo/document-id';

// lettore sanificante dei ref di `relatedLore` su documenti lean (Phase 18 D-23, Phase 19 D-26):
// id scritti come stringa da uno script di contenuto letti, voci illeggibili scartate, campo assente = nessuna lore
export const relatedLoreIdsOf = (relatedLore: unknown): Types.ObjectId[] =>
    Array.isArray(relatedLore)
        ? relatedLore.map(refIdOf).filter(isObjectId)
        : [];
