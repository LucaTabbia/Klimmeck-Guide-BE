import { Types } from 'mongoose';
import {
    newOwnedPetEntry,
    normalisedOwnedPets,
    ownedPetCountOf,
    ownsPet,
} from './owned-pet-entry';

const horse = new Types.ObjectId();
const camel = new Types.ObjectId();

describe('owned pet entry', () => {
    it('starts an owned pet with no experience and the catalogue life points (D-03)', () => {
        expect(newOwnedPetEntry(horse, 300)).toEqual({
            pet: horse,
            xp: 0,
            currentLifePoints: 300,
            level: 1,
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
                level: 1,
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

    it('reads an integer count from zero up as it is (D-03)', () => {
        expect(ownedPetCountOf(0)).toBe(0);
        expect(ownedPetCountOf(124)).toBe(124);
        expect(ownedPetCountOf(2147483647)).toBe(2147483647);
    });

    it('floors a fractional count, never below its integer part (D-04)', () => {
        expect(ownedPetCountOf(120.5)).toBe(120);
        expect(ownedPetCountOf(0.9)).toBe(0);
    });

    it.each([
        undefined,
        null,
        -1,
        -0.5,
        '12',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        2147483648,
        {},
    ])('reads a count that is not a valid amount as 0 (D-03): %p', (value) => {
        expect(ownedPetCountOf(value)).toBe(0);
    });

    it('keeps a well formed entry with its values, as a new object (D-03)', () => {
        const entry = { pet: camel, xp: 4, currentLifePoints: 7 };

        const [normalised] = normalisedOwnedPets([entry]);

        expect(normalised).toEqual({ pet: camel, xp: 4, currentLifePoints: 7 });
        expect(normalised).not.toBe(entry);
    });

    it('heals the numbers of a broken entry and its reference stored as a string (D-03)', () => {
        expect(
            normalisedOwnedPets([
                { pet: horse.toHexString(), xp: null, currentLifePoints: 9.7 },
                { pet: camel, _id: new Types.ObjectId(), xp: -3 },
            ]),
        ).toEqual([
            { pet: horse, xp: 0, currentLifePoints: 9 },
            { pet: camel, xp: 0, currentLifePoints: 0 },
        ]);
    });

    it('leaves out an entry whose pet cannot be read, keeping the order of the others (D-03)', () => {
        expect(
            normalisedOwnedPets([
                { pet: camel, xp: 1, currentLifePoints: 2 },
                null,
                { pet: 'not-an-id', xp: 5, currentLifePoints: 5 },
                { xp: 5, currentLifePoints: 5 },
                { pet: 42, xp: 5, currentLifePoints: 5 },
                'horse',
                { pet: horse, xp: 3, currentLifePoints: 4 },
            ]),
        ).toEqual([
            { pet: camel, xp: 1, currentLifePoints: 2 },
            { pet: horse, xp: 3, currentLifePoints: 4 },
        ]);
    });

    it('reads a missing list as empty (D-03)', () => {
        expect(normalisedOwnedPets(undefined)).toEqual([]);
        expect(normalisedOwnedPets(null)).toEqual([]);
    });

    it('starts a new companion at level 1, without a name and not resting (D-18, D-39)', () => {
        const id = new Types.ObjectId();

        expect(newOwnedPetEntry(id, 100)).toEqual({
            pet: id,
            xp: 0,
            currentLifePoints: 100,
            level: 1,
        });
    });

    describe('companion fields', () => {
        const lifeAsOf = new Date('2026-11-14T10:00:00.000Z');
        const defeatedUntil = new Date('2026-11-14T11:00:00.000Z');
        const potionRecoveryUntil = new Date('2026-11-14T10:30:00.000Z');

        it('keeps name, anchor, dates and level when the array is rewritten (D-23, D-39)', () => {
            const entry = {
                pet: camel,
                xp: 5,
                currentLifePoints: 20,
                name: 'Fenrir',
                lifeAsOf,
                defeatedUntil,
                potionRecoveryUntil,
                level: 3,
            };

            expect(normalisedOwnedPets([entry])).toEqual([entry]);
        });

        it.each([
            { name: '' },
            { name: 5 },
            { lifeAsOf: 'x' },
            { defeatedUntil: new Date('x') },
            { potionRecoveryUntil: null },
            { level: 0 },
            { level: 11 },
            { level: 2.5 },
        ])(
            'drops a blank name, an unreadable date and an invalid level instead of writing them (D-23): %p',
            (field) => {
                const [normalised] = normalisedOwnedPets([
                    { pet: camel, xp: 1, currentLifePoints: 2, ...field },
                ]);

                expect(Object.keys(normalised).sort()).toEqual([
                    'currentLifePoints',
                    'pet',
                    'xp',
                ]);
            },
        );

        it('keeps the three-key shape of an entry without the new fields (D-23)', () => {
            const [normalised] = normalisedOwnedPets([
                { pet: camel, xp: 1, currentLifePoints: 2 },
            ]);

            expect(Object.keys(normalised).sort()).toEqual([
                'currentLifePoints',
                'pet',
                'xp',
            ]);
        });
    });
});
