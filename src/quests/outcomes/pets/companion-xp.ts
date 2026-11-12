import {
    normalisedOwnedPets,
    type NewOwnedPetEntry,
    type OwnedPetEntry,
} from 'src/characters/pets/owned-pet-entry';
import { refIdOf } from 'src/mongo/document-id';
import { petXpAward } from 'src/quests/outcomes/pets/pet-xp';

export interface CompanionXpAward {
    // array intero nuovo, mai un path posizionale: nell'esito convive col pet in premio (Phase 19 Pitfall 4)
    ownedPets: NewOwnedPetEntry[] | null;
    gained: number;
}

export interface CompanionAssets {
    pet?: unknown;
    ownedPets?: readonly OwnedPetEntry[] | null;
}

const NO_AWARD: CompanionXpAward = { ownedPets: null, gained: 0 };

// premio di xp al compagno equipaggiato (D-04): senza compagno, senza voce, senza tetto valido o senza guadagno nulla cambia (D-17)
export function companionXpAward(
    assets: CompanionAssets | null | undefined,
    enemiesXp: number,
    petMaxXp: ReadonlyMap<string, number>,
): CompanionXpAward {
    const companionId = refIdOf(assets?.pet);
    if (!companionId) return NO_AWARD;
    // l'array si riscrive intero: le voci passano dalla normalizzazione condivisa, xp frazionari arrotondati per difetto compresi
    const owned = normalisedOwnedPets(assets?.ownedPets);
    const index = owned.findIndex((entry) => entry.pet.equals(companionId));
    const maxXp = petMaxXp.get(companionId.toHexString());
    if (index < 0 || maxXp === undefined) return NO_AWARD;
    const entry = owned[index];
    const { xp, gained } = petXpAward(enemiesXp, entry.xp, maxXp);
    if (gained <= 0) return NO_AWARD;
    return {
        ownedPets: owned.map((other, position) =>
            position === index ? { ...entry, xp } : other,
        ),
        gained,
    };
}
