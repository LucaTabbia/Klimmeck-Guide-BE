import { Int, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Clock } from 'src/auth/clock';
import { OwnedPet } from 'src/models/character/owned-pet.model';
import type { Pet } from 'src/models/pet.model';
import {
    companionLifeAt,
    companionStoredLifeOf,
    isPetDefeated,
} from './companion-life';
import { companionMaxLifeOf, companionStoredLevelOf } from './companion-level';
import { ownedPetCountOf } from './owned-pet-entry';

// fuori da findOne (lista dell'oste) il pet resta un ref nudo: nessun campo del catalogo leggibile
function catalogueOf(entry: OwnedPet): Partial<Pet> | null {
    const pet = entry.pet as Partial<Pet> | null | undefined;
    return typeof pet === 'object' && pet !== null ? pet : null;
}

// campi di sola visualizzazione (D-24): la regola è companion-life.ts, l'ora è quella della risoluzione
@Resolver(() => OwnedPet)
export class OwnedPetResolver {
    constructor(private readonly clock: Clock) {}

    @ResolveField('defeated', () => Boolean)
    defeated(@Parent() entry: OwnedPet): boolean {
        return isPetDefeated(entry, this.clock.now());
    }

    @ResolveField('fullLifeAt', () => Date, { nullable: true })
    fullLifeAt(@Parent() entry: OwnedPet): Date | null {
        const pet = catalogueOf(entry);
        const maxLifePoints = companionMaxLifeOf(entry, pet);
        return companionLifeAt({
            lifePoints: companionStoredLifeOf(entry, maxLifePoints),
            lifeAsOf: entry.lifeAsOf,
            resting: entry.lifeAsOf instanceof Date,
            maxLifePoints,
            recoveryTimeMs: pet?.recoveryTime,
            now: this.clock.now(),
        }).fullLifeAt;
    }

    @ResolveField('level', () => Int)
    level(@Parent() entry: OwnedPet): number {
        return companionStoredLevelOf(entry, catalogueOf(entry));
    }

    // massimo del compagno (D-38); con una base del catalogo non servibile la stessa normalizzazione dei campi Int!
    @ResolveField('maxLifePoints', () => Int)
    maxLifePoints(@Parent() entry: OwnedPet): number {
        const pet = catalogueOf(entry);
        return (
            companionMaxLifeOf(entry, pet) ??
            ownedPetCountOf(pet?.maxLifePoints)
        );
    }
}
