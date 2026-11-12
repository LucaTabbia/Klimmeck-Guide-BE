import { PET_XP_SHARE, petXpAward } from 'src/quests/outcomes/pets/pet-xp';

describe('petXpAward', () => {
    it('pins the share of the enemies xp that goes to the companion (D-04)', () => {
        expect(PET_XP_SHARE).toBe(0.1);
    });

    it.each([
        [100, 0, { xp: 10, gained: 10 }],
        [25, 0, { xp: 3, gained: 3 }],
        [24, 0, { xp: 2, gained: 2 }],
        [4, 7, { xp: 7, gained: 0 }],
        [130, 40, { xp: 53, gained: 13 }],
    ])(
        'awards the rounded tenth of the enemies xp: %p on %p (D-04)',
        (enemiesXp, currentXp, expected) => {
            expect(petXpAward(enemiesXp, currentXp, 1000)).toEqual(expected);
        },
    );

    it('caps the experience at the catalogue maximum and returns the effective gain (D-04, D-17)', () => {
        expect(petXpAward(500, 980, 1000)).toEqual({ xp: 1000, gained: 20 });
        expect(petXpAward(500, 1000, 1000)).toEqual({ xp: 1000, gained: 0 });
    });

    it('never lowers an experience already above the cap (D-04)', () => {
        expect(petXpAward(500, 1200, 1000)).toEqual({ xp: 1200, gained: 0 });
    });

    it.each([0, -1, -500, NaN, Infinity, undefined as never])(
        'awards nothing without enemies xp: %p (D-04)',
        (enemiesXp) => {
            expect(petXpAward(enemiesXp, 30, 1000)).toEqual({
                xp: 30,
                gained: 0,
            });
        },
    );

    it.each([NaN, 0, -5, 12.5, Infinity, '100' as never, undefined as never])(
        'awards nothing when the catalogue maximum is not valid: %p (D-17)',
        (maxXp) => {
            expect(petXpAward(500, 30, maxXp)).toEqual({ xp: 30, gained: 0 });
        },
    );
});
