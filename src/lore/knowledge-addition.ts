import type { Types } from 'mongoose';

// add-to-set solo per le liste non vuote (D-14, Pitfall 4): gli update esistenti restano byte-identici quando non c'è nulla da imparare; mai il set dell'intero insieme (D-01)

export interface KnowledgeAddition {
    $addToSet?: Record<string, { $each: Types.ObjectId[] }>;
}

export function knowledgeAdditionOf(
    lore: readonly Types.ObjectId[],
    enemies: readonly Types.ObjectId[] = [],
): KnowledgeAddition {
    const additions = {
        ...(lore.length ? { 'status.unlockedLore': { $each: [...lore] } } : {}),
        ...(enemies.length
            ? { 'status.knownEnemies': { $each: [...enemies] } }
            : {}),
    };
    return Object.keys(additions).length ? { $addToSet: additions } : {};
}
