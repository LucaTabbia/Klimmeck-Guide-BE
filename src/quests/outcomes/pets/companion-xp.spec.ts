import { Types } from 'mongoose';
import { companionXpAward } from 'src/quests/outcomes/pets/companion-xp';

const NO_CHANGE = { ownedPets: null, gained: 0 };

const wolf = new Types.ObjectId();
const hawk = new Types.ObjectId();
const horse = new Types.ObjectId();

const capsOf = (...caps: [Types.ObjectId, number][]) =>
    new Map(caps.map(([id, maxXp]) => [id.toHexString(), maxXp]));

const ownedPets = () => [
    { pet: wolf, xp: 5, currentLifePoints: 12 },
    { pet: hawk, xp: 40, currentLifePoints: 7 },
    { pet: horse, xp: 0, currentLifePoints: 30 },
];

describe('companionXpAward', () => {
    it('raises only the entry of the equipped companion and returns the whole list (D-04)', () => {
        const owned = ownedPets();

        const award = companionXpAward(
            { pet: hawk, ownedPets: owned },
            130,
            capsOf([wolf, 1000], [hawk, 1000], [horse, 1000]),
        );

        expect(award).toEqual({
            ownedPets: [
                { pet: wolf, xp: 5, currentLifePoints: 12 },
                { pet: hawk, xp: 53, currentLifePoints: 7 },
                { pet: horse, xp: 0, currentLifePoints: 30 },
            ],
            gained: 13,
        });
        expect(award.ownedPets).not.toBe(owned);
        expect(award.ownedPets?.[0]).toBe(owned[0]);
        expect(award.ownedPets?.[2]).toBe(owned[2]);
        expect(owned).toEqual(ownedPets());
    });

    it('keeps the life points of the companion untouched (D-04)', () => {
        const award = companionXpAward(
            {
                pet: wolf,
                ownedPets: [{ pet: wolf, xp: 0, currentLifePoints: 3 }],
            },
            100,
            capsOf([wolf, 1000]),
        );

        expect(award.ownedPets).toEqual([
            { pet: wolf, xp: 10, currentLifePoints: 3 },
        ]);
    });

    it('caps the gain of the companion at the catalogue maximum (D-04)', () => {
        const award = companionXpAward(
            {
                pet: wolf,
                ownedPets: [{ pet: wolf, xp: 95, currentLifePoints: 3 }],
            },
            500,
            capsOf([wolf, 100]),
        );

        expect(award).toEqual({
            ownedPets: [{ pet: wolf, xp: 100, currentLifePoints: 3 }],
            gained: 5,
        });
    });

    it.each([null, undefined])(
        'changes nothing without an equipped companion: %p (D-04)',
        (pet) => {
            expect(
                companionXpAward(
                    { pet, ownedPets: ownedPets() },
                    130,
                    capsOf([wolf, 1000], [hawk, 1000], [horse, 1000]),
                ),
            ).toEqual(NO_CHANGE);
        },
    );

    it.each([null, undefined, { pet: hawk }, { pet: hawk, ownedPets: null }])(
        'changes nothing without assets or owned pets: %p (D-04)',
        (assets) => {
            expect(companionXpAward(assets, 130, capsOf([hawk, 1000]))).toEqual(
                NO_CHANGE,
            );
        },
    );

    it('changes nothing when the equipped companion has no entry (D-04)', () => {
        expect(
            companionXpAward(
                {
                    pet: hawk,
                    ownedPets: [{ pet: wolf, xp: 5, currentLifePoints: 12 }],
                },
                130,
                capsOf([wolf, 1000], [hawk, 1000]),
            ),
        ).toEqual(NO_CHANGE);
    });

    it('changes nothing when the catalogue has no valid cap for the companion (D-17)', () => {
        expect(
            companionXpAward(
                { pet: hawk, ownedPets: ownedPets() },
                130,
                capsOf([wolf, 1000]),
            ),
        ).toEqual(NO_CHANGE);
    });

    it('changes nothing when the companion is already at its cap (D-17)', () => {
        expect(
            companionXpAward(
                {
                    pet: wolf,
                    ownedPets: [{ pet: wolf, xp: 100, currentLifePoints: 3 }],
                },
                500,
                capsOf([wolf, 100]),
            ),
        ).toEqual(NO_CHANGE);
    });

    it('changes nothing without enemies xp (D-04)', () => {
        expect(
            companionXpAward(
                { pet: hawk, ownedPets: ownedPets() },
                0,
                capsOf([hawk, 1000]),
            ),
        ).toEqual(NO_CHANGE);
    });

    it('finds the companion stored as a legacy string reference (D-04)', () => {
        const award = companionXpAward(
            {
                pet: hawk.toHexString(),
                ownedPets: [
                    { pet: hawk.toHexString(), xp: 40, currentLifePoints: 7 },
                ],
            },
            130,
            capsOf([hawk, 1000]),
        );

        expect(award).toEqual({
            ownedPets: [
                { pet: hawk.toHexString(), xp: 53, currentLifePoints: 7 },
            ],
            gained: 13,
        });
    });

    it('starts from 0 when the entry carries no valid experience (D-04)', () => {
        const award = companionXpAward(
            { pet: wolf, ownedPets: [{ pet: wolf, currentLifePoints: 3 }] },
            100,
            capsOf([wolf, 1000]),
        );

        expect(award).toEqual({
            ownedPets: [{ pet: wolf, xp: 10, currentLifePoints: 3 }],
            gained: 10,
        });
    });
});
