import { MIN_LIFE_POINTS } from 'src/quests/outcomes/progression/level-table';
import {
    FOOD_RULES,
    foodNeededFor,
    hpLostFor,
    uncoveredKmOf,
} from './travel-food';

describe('travel food rules', () => {
    it('pins three minutes of march per power and the one life point floor (D-01, D-07)', () => {
        expect(FOOD_RULES).toEqual({ minutesPerPower: 3, minLifePoints: 1 });
        expect(FOOD_RULES.minLifePoints).toBe(MIN_LIFE_POINTS);
    });

    it('needs one power every three minutes of march, rounded up (D-01)', () => {
        expect(foodNeededFor(0)).toBe(0);
        expect(foodNeededFor(-5)).toBe(0);
        expect(foodNeededFor(1)).toBe(1);
        expect(foodNeededFor(180_000)).toBe(1);
        expect(foodNeededFor(180_001)).toBe(2);
        expect(foodNeededFor(9_900_000)).toBe(55);
        expect(foodNeededFor(16_012_800)).toBe(89);
    });

    it('rounds the uncovered kilometres up (D-03)', () => {
        expect(uncoveredKmOf(55, 40, 16)).toBe(5);
        expect(uncoveredKmOf(55, 0, 16)).toBe(16);
        expect(uncoveredKmOf(89, 0, 22.24)).toBe(23);
        expect(uncoveredKmOf(55, 55, 16)).toBe(0);
        expect(uncoveredKmOf(55, 60, 16)).toBe(0);
        expect(uncoveredKmOf(0, 0, 10)).toBe(0);
    });

    it('counts the uncovered distance in whole metres, free of float error (D-03, D-07)', () => {
        expect(uncoveredKmOf(55, 5, 1.1)).toBe(1);
        expect(uncoveredKmOf(55, 40, 16.01)).toBe(5);
    });

    it('charges n life points for the n-th uncovered kilometre (D-02)', () => {
        expect(
            [0, 1, 5, 16, 23, 44, 45, 50, 100, 204, 506].map(hpLostFor),
        ).toEqual([0, 1, 15, 136, 276, 990, 1035, 1275, 5050, 20910, 128271]);
    });
});
