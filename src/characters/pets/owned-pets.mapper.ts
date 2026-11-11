import type { OwnedPet } from 'src/models/character/owned-pet.model';
import { ownedPetCountOf } from './owned-pet-entry';

// populate lascia null (o il ref nudo) il pet tolto dal catalogo: solo un oggetto con id stringa è un pet servibile
function isPopulated(pet: unknown): boolean {
    return typeof (pet as { id?: unknown } | null | undefined)?.id === 'string';
}

// `xp` e `currentLifePoints` sono `Int!`: un valore nullo, assente o frazionario scritto a mano si serve normalizzato; la voce a DB guarisce alla prima riscrittura dell'array
function withValidAmounts(entry: OwnedPet): OwnedPet {
    const xp = ownedPetCountOf(entry.xp);
    const currentLifePoints = ownedPetCountOf(entry.currentLifePoints);
    return entry.xp === xp && entry.currentLifePoints === currentLifePoints
        ? entry
        : { pet: entry.pet, xp, currentLifePoints };
}

// sul filo (Phase 19 D-23): una voce non servibile annullerebbe assets e il personaggio; la voce orfana o senza ref leggibile resta a DB
export function ownedPetsOnTheWire(
    entries: readonly OwnedPet[] | null | undefined,
): OwnedPet[] {
    return (entries ?? [])
        .filter((entry) => isPopulated(entry?.pet))
        .map(withValidAmounts);
}
