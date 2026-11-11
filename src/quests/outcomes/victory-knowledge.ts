import type { Types } from 'mongoose';
import {
    type KnowledgeAddition,
    knowledgeAdditionOf,
} from 'src/lore/knowledge-addition';
import { refHexOf } from 'src/lore/lore-visibility';
import { isObjectId, refIdOf } from 'src/mongo/document-id';

// conoscenza di una vittoria (Phase 16 D-06, D-09): lore dei nemici e id esatti, separata da enemyFactsOf perché quella è pinnata e serve all'xp (D-14)

export interface VictoryKnowledge {
    enemyIds: Types.ObjectId[];
    loreIds: Types.ObjectId[];
}

export interface VictoryCatalog {
    enemies: readonly {
        snapshot: { _id: Types.ObjectId; relatedLore?: unknown[] };
    }[];
}

export interface KnowledgeUpdate {
    fresh: Types.ObjectId[];
    addition: KnowledgeAddition;
}

function uniqueByHex(ids: readonly Types.ObjectId[]): Types.ObjectId[] {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const hex = id.toHexString();
        if (seen.has(hex)) return false;
        seen.add(hex);
        return true;
    });
}

export function victoryKnowledgeOf(
    catalog: VictoryCatalog,
): VictoryKnowledge | null {
    if (catalog.enemies.length === 0) return null;
    return {
        enemyIds: uniqueByHex(
            catalog.enemies.map(({ snapshot }) => snapshot._id),
        ),
        loreIds: uniqueByHex(
            catalog.enemies.flatMap(({ snapshot }) =>
                (snapshot.relatedLore ?? []).map(refIdOf).filter(isObjectId),
            ),
        ),
    };
}

// le sole novità rispetto allo snapshot in sessione vanno sul foglio (D-09); i nemici si aggiungono comunque, l'add-to-set è idempotente
export function knowledgeUpdateOf(
    known: readonly unknown[] | null | undefined,
    lore: readonly Types.ObjectId[],
    enemies: readonly Types.ObjectId[] = [],
): KnowledgeUpdate {
    const knownHex = new Set((known ?? []).map(refHexOf));
    const fresh = uniqueByHex(lore).filter(
        (id) => !knownHex.has(id.toHexString()),
    );
    return { fresh, addition: knowledgeAdditionOf(fresh, enemies) };
}
