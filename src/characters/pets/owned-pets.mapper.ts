import type { OwnedPet } from 'src/models/character/owned-pet.model';

// populate lascia null (o il ref nudo) il pet tolto dal catalogo: solo un oggetto con id stringa è un pet servibile
function isPopulated(pet: unknown): boolean {
    return typeof (pet as { id?: unknown } | null | undefined)?.id === 'string';
}

// sul filo (Phase 19 D-23): `OwnedPet.pet: Pet!` nullo annullerebbe assets e il personaggio; la voce orfana resta a DB
export function ownedPetsOnTheWire(
    entries: readonly OwnedPet[] | null | undefined,
): OwnedPet[] {
    return (entries ?? []).filter((entry) => isPopulated(entry?.pet));
}
