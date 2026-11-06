import { GAME_EARTH_RADIUS_KM, gameDistanceKm } from 'src/roads/game-distance';

describe('game distance', () => {
    it('measures game kilometres with the 127.42 km radius (D-21)', () => {
        expect(GAME_EARTH_RADIUS_KM).toBe(127.42);
        expect(gameDistanceKm([0, 0], [0, 1])).toBeCloseTo(2.2239, 4);
        expect(gameDistanceKm([0, 0], [0, 4.5])).toBeCloseTo(10.0075, 4);
        expect(gameDistanceKm([0, 0], [0, 9])).toBeCloseTo(20.0151, 4);
    });

    it('is zero on the same point and symmetric (D-21)', () => {
        const a: [number, number] = [1, 2];
        const b: [number, number] = [3, 5];

        expect(gameDistanceKm([12.5, 41.9], [12.5, 41.9])).toBe(0);
        expect(gameDistanceKm(a, b)).toBe(gameDistanceKm(b, a));
    });
});
