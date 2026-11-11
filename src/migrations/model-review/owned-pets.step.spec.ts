// UNA TANTUM (Phase 19 D-12): tabella della trasformazione dei riferimenti ai pet posseduti in voci con stato — esce dal repo dopo il boot reale
import { Types } from 'mongoose';
import { ownedPetEntriesOf } from './owned-pets.step';

const MASTIFF = new Types.ObjectId('64c000000000000000000001');
const HORSE = new Types.ObjectId('64c000000000000000000002');
const BROKEN = new Types.ObjectId('64c000000000000000000003');
const GONE = new Types.ObjectId('64c0000000000000000000ff');

const LIFE_POINTS = new Map<string, unknown>([
    [MASTIFF.toHexString(), 10],
    [HORSE.toHexString(), 25],
    [BROKEN.toHexString(), 12.5],
]);

describe('ownedPetEntriesOf', () => {
    it('turns a reference into an entry with no experience and the catalogue life points (D-03)', () => {
        expect(ownedPetEntriesOf([MASTIFF], LIFE_POINTS)).toEqual({
            entries: [{ pet: MASTIFF, xp: 0, currentLifePoints: 10 }],
            converted: 1,
            orphans: 0,
        });
    });

    it('reads a legacy string reference like an object id (D-03)', () => {
        expect(ownedPetEntriesOf([HORSE.toHexString()], LIFE_POINTS)).toEqual({
            entries: [{ pet: HORSE, xp: 0, currentLifePoints: 25 }],
            converted: 1,
            orphans: 0,
        });
    });

    it('keeps an entry that is already in the new shape with its state (D-03)', () => {
        const entry = { pet: MASTIFF, xp: 40, currentLifePoints: 12 };

        const migration = ownedPetEntriesOf([entry], LIFE_POINTS);

        expect(migration).toEqual({
            entries: [{ pet: MASTIFF, xp: 40, currentLifePoints: 12 }],
            converted: 0,
            orphans: 0,
        });
        expect(migration.entries[0]).toBe(entry);
    });

    it('gives an orphan pet an entry with 0 life points and counts it (D-23)', () => {
        expect(ownedPetEntriesOf([GONE, MASTIFF], LIFE_POINTS)).toEqual({
            entries: [
                { pet: GONE, xp: 0, currentLifePoints: 0 },
                { pet: MASTIFF, xp: 0, currentLifePoints: 10 },
            ],
            converted: 2,
            orphans: 1,
        });
    });

    it('reads a catalogue life amount that is not a valid integer as 0 (D-23)', () => {
        const lifePoints = new Map<string, unknown>([
            [BROKEN.toHexString(), 12.5],
            [MASTIFF.toHexString(), -1],
            [HORSE.toHexString(), undefined],
        ]);

        expect(ownedPetEntriesOf([BROKEN, MASTIFF, HORSE], lifePoints)).toEqual(
            {
                entries: [
                    { pet: BROKEN, xp: 0, currentLifePoints: 0 },
                    { pet: MASTIFF, xp: 0, currentLifePoints: 0 },
                    { pet: HORSE, xp: 0, currentLifePoints: 0 },
                ],
                converted: 3,
                orphans: 0,
            },
        );
    });

    it('keeps the order of the owned pets (D-03)', () => {
        const kept = { pet: HORSE, xp: 7, currentLifePoints: 3 };

        expect(
            ownedPetEntriesOf(
                [MASTIFF, kept, 'non un id', null, GONE.toHexString()],
                LIFE_POINTS,
            ),
        ).toEqual({
            entries: [
                { pet: MASTIFF, xp: 0, currentLifePoints: 10 },
                kept,
                'non un id',
                null,
                { pet: GONE, xp: 0, currentLifePoints: 0 },
            ],
            converted: 2,
            orphans: 1,
        });
    });
});
