import { Model, Types } from 'mongoose';
import { EnemyDocument } from 'src/models/enemy.model';
import { PetDocument } from 'src/models/pet.model';
import { refIdOf } from 'src/mongo/document-id';
import { stringsOf } from 'src/mongo/lean-values';
import { PetCandidate } from 'src/quests/generation/pet-prize';

export const PET_CANDIDATE_FIELDS = '_id rarity sellable enemy';

// rarità, vendibilità e legame curati a mano a DB: letti lean senza fidarsi del tipo
export interface LeanPetCandidate {
    _id: Types.ObjectId;
    rarity?: unknown;
    sellable?: unknown;
    enemy?: unknown;
}

interface LeanLinkedEnemy {
    _id: Types.ObjectId;
    locations?: unknown;
}

type EnemyLocations = ReadonlyMap<string, readonly string[]>;

const isObjectId = (id: Types.ObjectId | null): id is Types.ObjectId =>
    id !== null;

// un legame illeggibile vale nessun legame; un nemico sparito non dà nessuna zona (Phase 19 D-28)
export function petCandidateOf(
    pet: LeanPetCandidate,
    enemyLocations: EnemyLocations,
): PetCandidate {
    const enemyId = refIdOf(pet.enemy)?.toHexString() ?? null;
    return {
        id: pet._id.toHexString(),
        rarity: typeof pet.rarity === 'string' ? pet.rarity : null,
        sellable: typeof pet.sellable === 'boolean' ? pet.sellable : null,
        enemyId,
        enemyLocations: [...(enemyLocations.get(enemyId ?? '') ?? [])],
    };
}

// lettura dedicata dei nemici collegati: i leggendari non sono fra i candidati del generatore ma danno la zona al loro pet
async function readEnemyLocations(
    enemyModel: Model<EnemyDocument>,
    pets: readonly LeanPetCandidate[],
): Promise<EnemyLocations> {
    const enemyIds = pets.map((pet) => refIdOf(pet.enemy)).filter(isObjectId);
    if (enemyIds.length === 0) return new Map();
    const enemies = await enemyModel
        .find({ _id: { $in: enemyIds } })
        .select('_id locations')
        .lean<LeanLinkedEnemy[]>()
        .exec();
    return new Map(
        enemies.map((enemy) => [
            enemy._id.toHexString(),
            stringsOf(enemy.locations),
        ]),
    );
}

// tutti i pet, in vendita compresi: fasce e tetto di rarità li filtrano nel premio puro (Phase 19 D-28)
export async function readPetCandidates(
    petModel: Model<PetDocument>,
    enemyModel: Model<EnemyDocument>,
): Promise<PetCandidate[]> {
    const pets = await petModel
        .find({})
        .select(PET_CANDIDATE_FIELDS)
        .sort({ _id: 1 })
        .lean<LeanPetCandidate[]>()
        .exec();
    const enemyLocations = await readEnemyLocations(enemyModel, pets);
    return pets.map((pet) => petCandidateOf(pet, enemyLocations));
}
