import { Types } from 'mongoose';
import { petCandidateOf } from 'src/quests/generation/pet-candidate';

describe('pet candidate read by the generator', () => {
    const petId = new Types.ObjectId();
    const enemyId = new Types.ObjectId();
    const locations = new Map([[enemyId.toHexString(), ['forest', 'cave']]]);

    it('reads the rarity, the sale flag and the locations of the linked enemy (D-28)', () => {
        const candidate = petCandidateOf(
            { _id: petId, rarity: 'rare', sellable: false, enemy: enemyId },
            locations,
        );

        expect(candidate).toEqual({
            id: petId.toHexString(),
            rarity: 'rare',
            sellable: false,
            enemyId: enemyId.toHexString(),
            enemyLocations: ['forest', 'cave'],
        });
    });

    it('reads a link written as a string by a content script (D-28)', () => {
        const candidate = petCandidateOf(
            { _id: petId, enemy: enemyId.toHexString() },
            locations,
        );

        expect(candidate.enemyId).toBe(enemyId.toHexString());
        expect(candidate.enemyLocations).toEqual(['forest', 'cave']);
    });

    it('reads a pet without rarity, sale flag or link as a candidate of no band (D-28)', () => {
        expect(petCandidateOf({ _id: petId }, locations)).toEqual({
            id: petId.toHexString(),
            rarity: null,
            sellable: null,
            enemyId: null,
            enemyLocations: [],
        });
    });

    it('drops the values of the wrong type instead of trusting them (D-28)', () => {
        const candidate = petCandidateOf(
            { _id: petId, rarity: 3, sellable: 'no', enemy: 'not-an-id' },
            locations,
        );

        expect(candidate).toEqual({
            id: petId.toHexString(),
            rarity: null,
            sellable: null,
            enemyId: null,
            enemyLocations: [],
        });
    });

    it('gives no location to a pet whose linked enemy is gone (D-28)', () => {
        const orphan = new Types.ObjectId();

        const candidate = petCandidateOf(
            { _id: petId, enemy: orphan },
            locations,
        );

        expect(candidate.enemyId).toBe(orphan.toHexString());
        expect(candidate.enemyLocations).toEqual([]);
    });
});
