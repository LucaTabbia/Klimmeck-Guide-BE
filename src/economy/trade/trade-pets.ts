import {
    newOwnedPetEntry,
    ownsPet,
    type OwnedPetEntry,
} from 'src/characters/pets/owned-pet-entry';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { idForms, sameId } from 'src/mongo/document-id';
import type { TradeLine } from './trade-line';

export interface PetSnapshot {
    ownedPets?: readonly OwnedPetEntry[] | null;
    pet?: unknown;
}

export interface PetOutcome {
    ownedPets: OwnedPetEntry[];
    unequip: boolean;
}

// esadecimale del pet → `maxLifePoints` del catalogo, non validato
export type PetLifePoints = ReadonlyMap<string, unknown>;

const petLines = (lines: readonly TradeLine[]) =>
    lines.filter((line) => line.kind === 'Pet');

// lo stesso pet non si compra due volte: sullo snapshot in sessione, riaffermato nel filtro (D-14)
export function assertPetsNotOwned(
    lines: readonly TradeLine[],
    snapshot: PetSnapshot,
): void {
    for (const line of petLines(lines)) {
        if (line.direction !== 'buy') continue;
        if (ownsPet(snapshot.ownedPets, line.itemId)) {
            throw GameRuleException.petAlreadyOwned();
        }
    }
}

// null senza righe pet: ownedPets e pet restano fuori dall'update (Pitfall 5); comprare non equipaggia mai (D-14)
// si comprano e si vendono voci intere: il comprato parte dalla vita del catalogo, le altre voci tengono il loro stato (Phase 19 D-03)
export function applyTradeToPets(
    snapshot: PetSnapshot,
    lines: readonly TradeLine[],
    petLifePoints: PetLifePoints,
): PetOutcome | null {
    const pets = petLines(lines);
    if (pets.length === 0) return null;
    const ownedPets = [...(snapshot.ownedPets ?? [])];
    let unequip = false;
    for (const line of pets) {
        if (line.direction === 'buy') {
            ownedPets.push(
                newOwnedPetEntry(
                    line.itemId,
                    petLifePoints.get(line.itemId.toHexString()),
                ),
            );
            continue;
        }
        const index = ownedPets.findIndex((entry) =>
            sameId(entry?.pet, line.itemId),
        );
        if (index === -1) throw GameRuleException.itemNotOwned();
        ownedPets.splice(index, 1);
        if (sameId(snapshot.pet, line.itemId)) unequip = true;
    }
    return { ownedPets, unequip };
}

// rete di sicurezza nel filtro della scrittura: il comprato è ancora assente, il venduto ancora presente (D-14)
export function petOwnershipGuards(
    lines: readonly TradeLine[],
): Record<string, unknown>[] {
    return petLines(lines).map((line) => ({
        'assets.ownedPets.pet':
            line.direction === 'buy'
                ? { $nin: idForms(line.itemId) }
                : { $in: idForms(line.itemId) },
    }));
}
