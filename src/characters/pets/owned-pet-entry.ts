import type { Types } from 'mongoose';
import { refIdOf, sameId } from 'src/mongo/document-id';

// forma lean di una voce di `assets.ownedPets` (Phase 19 D-03): la condividono negozio ed esiti; a DB nulla la valida
export interface OwnedPetEntry {
    pet?: unknown;
    xp?: unknown;
    currentLifePoints?: unknown;
}

export interface NewOwnedPetEntry {
    pet: Types.ObjectId;
    xp: number;
    currentLifePoints: number;
}

// tetto di `Int` sullo SDL: oltre, il valore non è servibile
const MAX_WIRE_INT = 2 ** 31 - 1;

// xp e vita di una voce: un numero da 0 al tetto arrotondato per difetto (mai sotto la parte intera già posseduta, D-04), ogni altro valore 0
export function ownedPetCountOf(value: unknown): number {
    return typeof value === 'number' && value >= 0 && value <= MAX_WIRE_INT
        ? Math.floor(value)
        : 0;
}

// l'unica normalizzazione delle voci: la usano il filo e gli scrittori che riscrivono l'array intero, così una voce rotta guarisce alla prima riscrittura
// una voce senza ref leggibile resta fuori: riscritta farebbe fallire il cast dell'array a ogni tentativo
export function normalisedOwnedPets(
    entries: readonly unknown[] | null | undefined,
): NewOwnedPetEntry[] {
    return (entries ?? []).flatMap((entry) => {
        const { pet, xp, currentLifePoints } = (entry ?? {}) as OwnedPetEntry;
        const petId = refIdOf(pet);
        return petId
            ? [
                  {
                      pet: petId,
                      xp: ownedPetCountOf(xp),
                      currentLifePoints: ownedPetCountOf(currentLifePoints),
                  },
              ]
            : [];
    });
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
