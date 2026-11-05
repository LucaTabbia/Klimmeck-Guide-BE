import { Model, Types } from 'mongoose';
import { EnemyDocument } from 'src/models/enemy.model';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { LoreDocument } from 'src/models/lore.model';
import { stringsOf } from 'src/mongo/lean-values';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';

export const ENEMY_CANDIDATE_FIELDS =
    '_id name xp locations legendary relatedLore baseWeaknesses energyWeaknesses';

export interface LeanEnemyCandidate {
    _id: Types.ObjectId;
    name?: string | null;
    xp?: unknown;
    locations?: unknown;
    legendary?: unknown;
    relatedLore?: Types.ObjectId[] | null;
    baseWeaknesses?: unknown;
    energyWeaknesses?: unknown;
}

export function enemyCandidateOf(
    enemy: LeanEnemyCandidate,
    animalLoreIds: ReadonlySet<string>,
): EnemyCandidate {
    const relatedLore = (enemy.relatedLore ?? []).map((id) => id.toHexString());
    return {
        id: enemy._id.toHexString(),
        name: enemy.name ?? '',
        xp: typeof enemy.xp === 'number' ? enemy.xp : 0,
        locations: stringsOf(enemy.locations),
        // passato così com'è: il filtro dei pool è fail-closed (D-04 della Phase 13)
        legendary: enemy.legendary,
        relatedLore,
        baseWeaknesses: stringsOf(enemy.baseWeaknesses),
        energyWeaknesses: stringsOf(enemy.energyWeaknesses),
        animal: relatedLore.some((id) => animalLoreIds.has(id)),
    };
}

// solo i non leggendari marcati (D-04 della Phase 13); la regola sugli animali resta nel pool puro (13.1 D-01)
export async function readEnemyCandidates(
    enemyModel: Model<EnemyDocument>,
    loreModel: Model<LoreDocument>,
): Promise<EnemyCandidate[]> {
    const animalLore = await loreModel
        .find({ type: LoreType.animal })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>()
        .exec();
    const animalLoreIds = new Set(
        animalLore.map((lore) => lore._id.toHexString()),
    );
    const enemies = await enemyModel
        .find({ legendary: false })
        .select(ENEMY_CANDIDATE_FIELDS)
        .sort({ _id: 1 })
        .lean<LeanEnemyCandidate[]>()
        .exec();
    return enemies.map((enemy) => enemyCandidateOf(enemy, animalLoreIds));
}
