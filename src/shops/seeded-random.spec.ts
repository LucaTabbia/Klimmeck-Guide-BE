import { mulberry32, seedOf } from './seeded-random';

const CITY_ID = '6909620459bb3490e08d63fc';

describe('seedOf', () => {
    it('derives a stable 32-bit seed from the seed version, the city and the list (D-24)', () => {
        expect(seedOf('v1', CITY_ID, 'equipment')).toBe(151343695);
        expect(seedOf('v1', CITY_ID, 'loot')).toBe(3292801665);
    });

    it('derives a separate stream per list (D-24)', () => {
        expect(seedOf('v1', CITY_ID, 'equipment')).not.toBe(
            seedOf('v1', CITY_ID, 'loot'),
        );
    });
});

describe('mulberry32', () => {
    it('replays the same mulberry32 sequence for the same seed (D-24)', () => {
        const next = mulberry32(1);
        expect([next(), next(), next()]).toEqual([
            0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
        ]);

        const first = mulberry32(42);
        const second = mulberry32(42);
        const firstDraws = Array.from({ length: 20 }, () => first());
        const secondDraws = Array.from({ length: 20 }, () => second());
        expect(secondDraws).toEqual(firstDraws);
    });

    it('draws within the unit interval (D-24)', () => {
        const next = mulberry32(seedOf('v1', 'x', 'loot'));
        const draws = Array.from({ length: 1000 }, () => next());
        expect(draws.every((draw) => draw >= 0 && draw < 1)).toBe(true);
    });
});
