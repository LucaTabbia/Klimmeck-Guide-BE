import { Types } from 'mongoose';
import {
    duePetRecoveriesFilter,
    duePetsOf,
    petRecoveryClaim,
} from './pet-recovery';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const EARLIER = new Date('2026-11-14T11:00:00.000Z');
const LATER = new Date('2026-11-14T13:00:00.000Z');
const CHARACTER_ID = new Types.ObjectId('64b0000000000000000000c1');
const WORG_ID = new Types.ObjectId('64b0000000000000000000a1');
const HORSE_ID = new Types.ObjectId('64b0000000000000000000a2');
const FOX_ID = new Types.ObjectId('64b0000000000000000000a3');

describe('pet recovery', () => {
    it('finds the characters with a companion whose defeat is over (D-24)', () => {
        expect(duePetRecoveriesFilter(NOW)).toEqual({
            deletedAt: null,
            'assets.ownedPets.defeatedUntil': { $lte: NOW },
        });
    });

    it('claims only the marker of the due entry (Pitfall 6, D-24)', () => {
        const claim = petRecoveryClaim(CHARACTER_ID, WORG_ID, NOW);

        expect(claim.update).toEqual({
            $set: { 'assets.ownedPets.$[entry].defeatedUntil': null },
        });
        expect(claim.filter).toEqual({
            _id: CHARACTER_ID,
            deletedAt: null,
            'assets.ownedPets': {
                $elemMatch: {
                    pet: { $in: [WORG_ID, WORG_ID.toHexString()] },
                    defeatedUntil: { $lte: NOW },
                },
            },
        });
        expect(claim.options).toEqual({
            arrayFilters: [
                {
                    'entry.pet': { $in: [WORG_ID, WORG_ID.toHexString()] },
                    'entry.defeatedUntil': { $lte: NOW },
                },
            ],
        });
    });

    it('lists the due companions of a character and skips the others (D-11)', () => {
        expect(
            duePetsOf(
                [
                    { pet: WORG_ID, name: 'Fenrir', defeatedUntil: EARLIER },
                    { pet: HORSE_ID, defeatedUntil: LATER },
                    { pet: FOX_ID, currentLifePoints: 3, lifeAsOf: EARLIER },
                ],
                NOW,
            ),
        ).toEqual([{ petId: WORG_ID, name: 'Fenrir' }]);
    });

    it('reads a legacy string ref and a defeat ending right now as due (D-24)', () => {
        expect(
            duePetsOf(
                [{ pet: WORG_ID.toHexString(), defeatedUntil: NOW }],
                NOW,
            ),
        ).toEqual([{ petId: WORG_ID, name: undefined }]);
    });

    it('lists nothing without entries (D-11)', () => {
        expect(duePetsOf(null, NOW)).toEqual([]);
        expect(duePetsOf(undefined, NOW)).toEqual([]);
        expect(
            duePetsOf([{ pet: 'broken', defeatedUntil: EARLIER }], NOW),
        ).toEqual([]);
    });
});
