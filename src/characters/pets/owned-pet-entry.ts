import type { Types } from 'mongoose';
import { refIdOf, sameId } from 'src/mongo/document-id';

// forma lean di una voce di `assets.ownedPets` (Phase 19 D-03): la condividono negozio ed esiti
export interface OwnedPetEntry {
    pet?: unknown;
    xp?: number;
    currentLifePoints?: number;
}

export interface NewOwnedPetEntry {
    pet: Types.ObjectId;
    xp: number;
    currentLifePoints: number;
}

// il catalogo è contenuto non validato: una vita non intera o negativa vale 0, il codice non ne inventa una
function startingLifePoints(maxLifePoints: unknown): number {
    return typeof maxLifePoints === 'number' &&
        Number.isInteger(maxLifePoints) &&
        maxLifePoints >= 0
        ? maxLifePoints
        : 0;
}

export function newOwnedPetEntry(
    petId: Types.ObjectId,
    maxLifePoints: unknown,
): NewOwnedPetEntry {
    return {
        pet: petId,
        xp: 0,
        currentLifePoints: startingLifePoints(maxLifePoints),
    };
}

export function ownsPet(
    entries: readonly OwnedPetEntry[] | null | undefined,
    petId: unknown,
): boolean {
    const id = refIdOf(petId);
    if (!id) return false;
    return (entries ?? []).some((entry) => sameId(entry?.pet, id));
}
