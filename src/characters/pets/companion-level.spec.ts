import {
    companionLevelOf,
    companionLevelThresholds,
    companionMaxLifeOf,
    companionStoredLevelOf,
} from './companion-level';

const THRESHOLDS = [0, 2, 7, 13, 22, 33, 47, 62, 80, 100];
const MAX_LIVES = [100, 102, 107, 113, 122, 133, 147, 162, 180, 200];
const LEVEL_ROWS = THRESHOLDS.map((threshold, index) => ({
    level: index + 1,
    threshold,
    maxLifePoints: MAX_LIVES[index],
}));

describe('companion levels', () => {
    it('fixes the ten thresholds and maximum lives of a pet with base 100 and cap 100 (D-37)', () => {
        expect(companionLevelThresholds(100)).toEqual(THRESHOLDS);
    });

    it.each(LEVEL_ROWS)(
        'reaches level $level at $threshold xp with $maxLifePoints life points (D-37)',
        ({ level, threshold, maxLifePoints }) => {
            expect(companionLevelOf(threshold, 100, 100)).toEqual({
                level,
                maxLifePoints,
            });
            if (level >= 2) {
                expect(companionLevelOf(threshold - 1, 100, 100).level).toBe(
                    level - 1,
                );
            }
        },
    );

    it('doubles the life of the falcon and of the pegasus at the cap (D-37)', () => {
        expect(companionLevelOf(100, 100, 100)).toEqual({
            level: 10,
            maxLifePoints: 200,
        });
        expect(companionLevelOf(2350, 2350, 5900)).toEqual({
            level: 10,
            maxLifePoints: 11800,
        });
    });

    it('keeps level 10 beyond the cap (D-37)', () => {
        expect(companionLevelOf(150, 100, 100)).toEqual({
            level: 10,
            maxLifePoints: 200,
        });
    });

    it.each([0, undefined, -5, 'x'])(
        'starts at level 1 with the base life (D-37): %p',
        (xp) => {
            expect(companionLevelOf(xp, 100, 100)).toEqual({
                level: 1,
                maxLifePoints: 100,
            });
        },
    );

    it.each([null, 0, -1, 1.5])(
        'keeps level 1 and the base life with an invalid cap (D-38): %p',
        (maxXp) => {
            for (const xp of [0, 50, 5000]) {
                expect(companionLevelOf(xp, maxXp, 100)).toEqual({
                    level: 1,
                    maxLifePoints: 100,
                });
            }
        },
    );

    it.each([null, 0, 2.5])(
        'serves no maximum for an unusable catalogue life (D-38): %p',
        (baseLifePoints) => {
            expect(
                companionLevelOf(22, 100, baseLifePoints).maxLifePoints,
            ).toBeNull();
        },
    );

    it('reads the maximum of an owned companion from its xp (D-38)', () => {
        const pet = { maxXp: 100, maxLifePoints: 100 };
        expect(companionMaxLifeOf({ xp: 22 }, pet)).toBe(122);
        expect(companionMaxLifeOf(null, pet)).toBe(100);
        expect(companionMaxLifeOf({ xp: 22 }, null)).toBeNull();
    });

    it('serves the saved level and derives the maximum from it (D-39)', () => {
        const entry = { xp: 0, level: 4 };
        expect(companionStoredLevelOf(entry, { maxXp: 100 })).toBe(4);
        expect(
            companionMaxLifeOf(entry, { maxXp: 100, maxLifePoints: 100 }),
        ).toBe(113);
    });

    it.each([undefined, 0, 11, 2.5, '3'])(
        'recomputes the level of an entry saved before the levels (D-39): %p',
        (level) => {
            expect(
                companionStoredLevelOf({ xp: 47, level }, { maxXp: 100 }),
            ).toBe(7);
        },
    );
});
