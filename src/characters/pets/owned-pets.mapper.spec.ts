import { Types } from 'mongoose';
import type { OwnedPet } from 'src/models/character/owned-pet.model';
import type { Pet } from 'src/models/pet.model';
import { ownedPetsOnTheWire } from './owned-pets.mapper';

function populated(name: string): Pet {
    return { id: new Types.ObjectId().toHexString(), name } as unknown as Pet;
}

function entryOf(pet: unknown, xp = 0, currentLifePoints = 10): OwnedPet {
    return { pet, xp, currentLifePoints } as OwnedPet;
}

describe('owned pets on the wire', () => {
    it('keeps the entries whose pet is populated, in order (D-23)', () => {
        const horse = entryOf(populated('Cavallo'), 12, 80);
        const cat = entryOf(populated('Gatto'));

        expect(ownedPetsOnTheWire([horse, cat])).toEqual([horse, cat]);
    });

    it('drops the entry whose pet is gone from the catalogue (D-23)', () => {
        const horse = entryOf(populated('Cavallo'));

        expect(
            ownedPetsOnTheWire([
                entryOf(null),
                horse,
                entryOf(new Types.ObjectId()),
                entryOf(undefined),
            ]),
        ).toEqual([horse]);
    });

    it('serves the numbers of a broken entry as valid amounts and keeps its pet (D-03)', () => {
        const horse = populated('Cavallo');
        const cat = populated('Gatto');
        const owl = populated('Gufo');

        expect(
            ownedPetsOnTheWire([
                entryOf(horse, null as unknown as number, 12.9),
                { pet: cat, xp: -4 } as unknown as OwnedPet,
                entryOf(owl, 120.5, Number.NaN),
            ]),
        ).toEqual([
            { pet: horse, xp: 0, currentLifePoints: 12 },
            { pet: cat, xp: 0, currentLifePoints: 0 },
            { pet: owl, xp: 120, currentLifePoints: 0 },
        ]);
    });

    it('drops a null entry instead of throwing (D-23)', () => {
        const horse = entryOf(populated('Cavallo'));

        expect(
            ownedPetsOnTheWire([null as unknown as OwnedPet, horse]),
        ).toEqual([horse]);
    });

    it('reads a missing list as empty (D-23)', () => {
        expect(ownedPetsOnTheWire(undefined)).toEqual([]);
        expect(ownedPetsOnTheWire(null)).toEqual([]);
    });
});
