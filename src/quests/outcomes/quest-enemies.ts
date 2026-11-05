import type { Types } from 'mongoose';
import { refIdOf } from 'src/mongo/document-id';
import { isPositiveInteger } from './outcome-numbers';

export interface StoredQuestEnemies {
    enemies?: unknown;
    enemy?: unknown;
}

export interface StoredQuestEnemy {
    enemy?: unknown;
    quantity?: unknown;
}

export interface QuestEnemyRef {
    enemy: Types.ObjectId;
    quantity: number;
}

// sweeper e processor possono leggere (lean) prima della migrazione al boot (D-28): vale anche la forma vecchia
export function questEnemiesOf(
    infos: StoredQuestEnemies | null | undefined,
): (StoredQuestEnemy | null)[] {
    if (Array.isArray(infos?.enemies))
        return infos.enemies as (StoredQuestEnemy | null)[];
    return infos?.enemy ? [{ enemy: infos.enemy, quantity: 1 }] : [];
}

// voci scritte a mano a DB: ref valido e quantità intera ≥ 1, altrimenti scartate, mai un'eccezione
export function validQuestEnemiesOf(
    infos: StoredQuestEnemies | null | undefined,
): QuestEnemyRef[] {
    return questEnemiesOf(infos).flatMap((entry) => {
        const enemy = refIdOf(entry?.enemy);
        const quantity = entry?.quantity;
        return enemy && isPositiveInteger(quantity)
            ? [{ enemy, quantity }]
            : [];
    });
}
