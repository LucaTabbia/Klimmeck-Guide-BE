import type { PopulateOptions } from 'mongoose';

export const QUEST_CATALOG_POPULATE: PopulateOptions[] = [];

export function dropOrphanCatalogRefs(quest: unknown): void {
    void quest;
}
