import { Types } from 'mongoose';
import { newOwnedPetEntry, ownsPet } from './owned-pet-entry';

const horse = new Types.ObjectId();
const camel = new Types.ObjectId();

describe('owned pet entry', () => {
    it('starts an owned pet with no experience and the catalogue life points (D-03)', () => {
        expect(newOwnedPetEntry(horse, 300)).toEqual({
            pet: horse,
            xp: 0,
            currentLifePoints: 300,
        });
        expect(newOwnedPetEntry(horse, 0).currentLifePoints).toBe(0);
    });

    it.each([undefined, null, 12.5, -1, '300', Number.NaN])(
        'starts at 0 life points when the catalogue value is not a valid amount (D-03): %p',
        (maxLifePoints) => {
            expect(newOwnedPetEntry(horse, maxLifePoints)).toEqual({
                pet: horse,
                xp: 0,
                currentLifePoints: 0,
            });
        },
    );

    it('finds an owned pet by the reference of its entry in both stored forms (D-03)', () => {
        const entries = [
            { pet: camel, xp: 4, currentLifePoints: 7 },
            { pet: horse.toHexString(), xp: 0, currentLifePoints: 10 },
        ];

        expect(ownsPet(entries, camel)).toBe(true);
        expect(ownsPet(entries, horse)).toBe(true);
        expect(ownsPet(entries, horse.toHexString())).toBe(true);
        expect(ownsPet(entries, new Types.ObjectId())).toBe(false);
        expect(ownsPet([{ xp: 1 }, { pet: null }], horse)).toBe(false);
        expect(ownsPet(undefined, horse)).toBe(false);
        expect(ownsPet(null, horse)).toBe(false);
        expect(ownsPet(entries, null)).toBe(false);
    });
});
