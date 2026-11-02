import type { PopulateOptions } from 'mongoose';
import { Lore } from 'src/models/lore.model';

// relatedLore è [Lore!]!: un ObjectId grezzo o pendente annullerebbe l'intera risposta sul filo
export const RELATED_LORE_POPULATE: PopulateOptions = {
    path: 'relatedLore',
    model: Lore.name,
};

export function withoutOrphanRelatedLore<T extends { relatedLore?: unknown[] }>(
    doc: T,
): T {
    const related = doc.relatedLore;
    if (!related?.some((lore) => lore == null)) return doc;
    doc.relatedLore = related.filter((lore) => lore != null);
    return doc;
}
