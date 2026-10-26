import {
    LEVEL_TABLE,
    MAX_XP,
    levelRowFor,
    progressionAfter,
} from 'src/quests/outcomes/progression/level-table';

describe('LEVEL_TABLE', () => {
    it('has 20 rows with levels 1..20 and strictly increasing thresholds and life points', () => {
        expect(LEVEL_TABLE).toHaveLength(20);
        LEVEL_TABLE.forEach((row, index) => {
            expect(row.level).toBe(index + 1);
            if (index === 0) return;
            const previous = LEVEL_TABLE[index - 1];
            expect(row.minXp).toBeGreaterThan(previous.minXp);
            expect(row.maxLifePoints).toBeGreaterThan(previous.maxLifePoints);
        });
    });

    it('starts at level 1 with 1000 life points and ends at level 20 with 40000', () => {
        expect(LEVEL_TABLE[0]).toEqual({
            level: 1,
            minXp: 0,
            maxLifePoints: 1000,
        });
        expect(LEVEL_TABLE[LEVEL_TABLE.length - 1]).toEqual({
            level: 20,
            minXp: 50000,
            maxLifePoints: 40000,
        });
    });

    it('caps the xp at 50000', () => {
        expect(MAX_XP).toBe(50000);
    });
});

describe('levelRowFor', () => {
    it.each([
        [0, 1, 1000],
        [249, 1, 1000],
        [250, 2, 1200],
        [799, 2, 1200],
        [800, 3, 1600],
        [2650, 5, 3050],
        [11850, 10, 10250],
        [49999, 19, 36100],
        [50000, 20, 40000],
    ])('maps %i xp to level %i with %i max life points', (xp, level, max) => {
        const row = levelRowFor(xp);

        expect(row.level).toBe(level);
        expect(row.maxLifePoints).toBe(max);
    });
});

describe('progressionAfter', () => {
    it('raises level and max life points without healing on level up', () => {
        expect(
            progressionAfter({ xp: 2500, currentLifePoints: 500 }, 300, 500),
        ).toEqual({
            xp: 2800,
            level: 5,
            maxLifePoints: 3050,
            currentLifePoints: 500,
        });
    });

    it('clamps the xp at MAX_XP', () => {
        expect(
            progressionAfter(
                { xp: 49900, currentLifePoints: 36100 },
                5000,
                36100,
            ),
        ).toEqual({
            xp: 50000,
            level: 20,
            maxLifePoints: 40000,
            currentLifePoints: 36100,
        });
    });

    it('clamps the life points to the max of the level', () => {
        expect(
            progressionAfter({ xp: 0, currentLifePoints: 1000 }, 0, 5000)
                .currentLifePoints,
        ).toBe(1000);
    });

    it('treats negative xp as zero', () => {
        expect(
            progressionAfter({ xp: -10, currentLifePoints: 1000 }, -50, 900),
        ).toEqual({
            xp: 0,
            level: 1,
            maxLifePoints: 1000,
            currentLifePoints: 900,
        });
    });

    it('never drops the life points below 1 and tolerates a missing snapshot', () => {
        expect(
            progressionAfter(
                { xp: undefined, currentLifePoints: undefined },
                100,
                0,
            ),
        ).toEqual({
            xp: 100,
            level: 1,
            maxLifePoints: 1000,
            currentLifePoints: 1,
        });
    });

    it('falls back to 1 life point when the outcome is not a finite number', () => {
        expect(
            progressionAfter({ xp: 0, currentLifePoints: 1000 }, 0, Number.NaN)
                .currentLifePoints,
        ).toBe(1);
    });
});
