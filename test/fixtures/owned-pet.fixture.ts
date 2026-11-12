import { Types } from 'mongoose';

export interface OwnedPetSeed {
    pet: Types.ObjectId;
    xp: number;
    currentLifePoints: number;
}

/**
 * Voce di `assets.ownedPets` nella forma a DB: ref al catalogo più lo stato del
 * pet sul personaggio (Phase 19 D-03). La vita di default è quella di `buildPet`.
 */
export function buildOwnedPet(
    pet: Types.ObjectId,
    overrides: Partial<{ xp: number; currentLifePoints: number }> = {},
): OwnedPetSeed {
    return { pet, xp: 0, currentLifePoints: 10, ...overrides };
}
