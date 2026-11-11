import type { Types } from 'mongoose';
import { refIdOf } from 'src/mongo/document-id';

const isObjectId = (id: Types.ObjectId | null): id is Types.ObjectId =>
    id !== null;

// lettore sanificante dei ref di `relatedLore` su documenti lean (Phase 18 D-23, Phase 19 D-26):
// id scritti come stringa da uno script di contenuto letti, voci illeggibili scartate, campo assente = nessuna lore
export const relatedLoreIdsOf = (relatedLore: unknown): Types.ObjectId[] =>
    Array.isArray(relatedLore)
        ? relatedLore.map(refIdOf).filter(isObjectId)
        : [];
