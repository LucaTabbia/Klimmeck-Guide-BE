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

    it('reads a missing list as empty (D-23)', () => {
        expect(ownedPetsOnTheWire(undefined)).toEqual([]);
        expect(ownedPetsOnTheWire(null)).toEqual([]);
    });
});
