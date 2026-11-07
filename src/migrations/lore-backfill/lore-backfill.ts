import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { refIdOf } from 'src/mongo/document-id';

// backfill una tantum delle lore (Phase 16 D-11): esce dal repo dopo il boot reale; unione, mai sovrascrittura

// gmCompleted con nemici insegna come un success (D-06, C-1)
export const WON_RESULT_OUTCOMES = [
    QuestOutcome.success,
    QuestOutcome.gmCompleted,
] as const;

export interface BackfillResult {
    enemies?: { enemy?: unknown }[] | null;
    enemy?: unknown;
}

export interface BackfillCharacterStatus {
    location?: unknown;
    unlockedLore?: unknown[] | null;
    knownEnemies?: unknown[] | null;
}

export interface LoreBackfillPlan {
    loreIds: Types.ObjectId[];
    enemyIds: Types.ObjectId[];
}

function uniqueIdsOf(refs: readonly unknown[]): Types.ObjectId[] {
    const seen = new Set<string>();
    const ids: Types.ObjectId[] = [];
    for (const id of refs.map(refIdOf)) {
        if (id === null || seen.has(id.toHexString())) continue;
        seen.add(id.toHexString());
        ids.push(id);
    }
    return ids;
}

function hexSetOf(refs: readonly unknown[] | null | undefined): Set<string> {
    return new Set(uniqueIdsOf(refs ?? []).map((id) => id.toHexString()));
}

// la forma legacy a nemico singolo precede la Phase 13: la migra QuestEnemiesMigrator, ma si leggono entrambe
export function wonEnemyIdsOf(
    results: readonly BackfillResult[],
): Types.ObjectId[] {
    return uniqueIdsOf(
        results.flatMap((result) => [
            ...(result.enemies ?? []).map((entry) => entry?.enemy),
            result.enemy,
        ]),
    );
}

export function loreBackfillOf(input: {
    status: BackfillCharacterStatus | null | undefined;
    geography: readonly Types.ObjectId[];
    enemyIds: readonly Types.ObjectId[];
    enemyLore: ReadonlyMap<string, readonly Types.ObjectId[]>;
}): LoreBackfillPlan {
    const knownLore = hexSetOf(input.status?.unlockedLore);
    const knownEnemies = hexSetOf(input.status?.knownEnemies);
    const candidates = uniqueIdsOf([
        ...input.geography,
        ...input.enemyIds.flatMap(
            (enemy) => input.enemyLore.get(enemy.toHexString()) ?? [],
        ),
    ]);
    return {
        loreIds: candidates.filter((id) => !knownLore.has(id.toHexString())),
        enemyIds: uniqueIdsOf(input.enemyIds).filter(
            (id) => !knownEnemies.has(id.toHexString()),
        ),
    };
}
