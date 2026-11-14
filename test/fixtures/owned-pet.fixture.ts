import { Types } from 'mongoose';

export interface OwnedPetSeed {
    pet: Types.ObjectId;
    xp: number;
    currentLifePoints: number;
    name?: string;
    lifeAsOf?: Date;
    defeatedUntil?: Date;
    potionRecoveryUntil?: Date;
    level?: number;
}

export type OwnedPetOverrides = Partial<Omit<OwnedPetSeed, 'pet'>>;

/**
 * Voce di `assets.ownedPets` nella forma a DB: ref al catalogo più lo stato del
 * pet sul personaggio (Phase 19 D-03). La vita di default è quella di `buildPet`;
 * i campi della Phase 23 compaiono solo se passati (voce a tre chiavi di default).
 */
export function buildOwnedPet(
    pet: Types.ObjectId,
    overrides: OwnedPetOverrides = {},
): OwnedPetSeed {
    return { pet, xp: 0, currentLifePoints: 10, ...overrides };
}
