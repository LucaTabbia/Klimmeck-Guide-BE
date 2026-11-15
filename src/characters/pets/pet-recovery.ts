import type { Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import { idForms, refIdOf } from 'src/mongo/document-id';
import type { OwnedPetEntry } from './owned-pet-entry';

export interface DuePetRecovery {
    petId: Types.ObjectId;
    name: unknown;
}

export interface PetRecoveryClaim {
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    options: { arrayFilters: Record<string, unknown>[] };
}

// personaggi attivi con almeno un compagno la cui sconfitta è finita: lo stesso confine di isPetDefeated (D-24)
export const duePetRecoveriesFilter = (now: Date): Record<string, unknown> => ({
    ...ACTIVE_CHARACTER_FILTER,
    'assets.ownedPets.defeatedUntil': { $lte: now },
});

// claim di una voce (sonda P2): azzera il SOLO marcatore, vita, xp e livello restano come sono (Pitfall 6)
export function petRecoveryClaim(
    characterId: Types.ObjectId,
    petId: Types.ObjectId,
    now: Date,
): PetRecoveryClaim {
    const pet = { $in: idForms(petId) };
    const due = { $lte: now };
    return {
        filter: {
            _id: characterId,
            ...ACTIVE_CHARACTER_FILTER,
            'assets.ownedPets': {
                $elemMatch: { pet, defeatedUntil: due },
            },
        },
        update: {
            $set: { 'assets.ownedPets.$[entry].defeatedUntil': null },
        },
        options: {
            arrayFilters: [{ 'entry.pet': pet, 'entry.defeatedUntil': due }],
        },
    };
}

const isDueAt = (value: unknown, now: Date): boolean =>
    value instanceof Date && value.getTime() <= now.getTime();

// le voci con la sconfitta finita; il ferito a riposo non ha marcatore e resta fuori (D-11)
export function duePetsOf(
    entries: readonly OwnedPetEntry[] | null | undefined,
    now: Date,
): DuePetRecovery[] {
    return (entries ?? []).flatMap((entry) => {
        const petId = refIdOf(entry.pet);
        return petId && isDueAt(entry.defeatedUntil, now)
            ? [{ petId, name: entry.name }]
            : [];
    });
}
