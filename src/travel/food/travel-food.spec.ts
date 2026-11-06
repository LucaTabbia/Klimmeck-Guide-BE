import { Types } from 'mongoose';
import { MIN_LIFE_POINTS } from 'src/quests/outcomes/progression/level-table';
import { FoodStack } from './food-selection';
import {
    FOOD_RULES,
    foodNeededFor,
    hpLostFor,
    planTravelFood,
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

const A = new Types.ObjectId('64b0000000000000000000a1');
const B = new Types.ObjectId('64b0000000000000000000a2');

function stack(
    itemId: Types.ObjectId,
    power: number,
    quantity: number,
    sellCopper = 1,
): FoodStack {
    return { itemId, power, quantity, sellCopper };
}

describe('travel food plan', () => {
    const partial = { durationMs: 9_900_000, distanceKm: 16 };

    it('plans a covered travel without life lost (D-04)', () => {
        expect(
            planTravelFood({
                ...partial,
                hpBefore: 100,
                stacks: [stack(A, 50, 1), stack(B, 10, 1)],
            }),
        ).toEqual({
            consumed: [
                { itemId: A, quantity: 1 },
                { itemId: B, quantity: 1 },
            ],
            needed: 55,
            covered: 60,
            uncoveredKm: 0,
            hpLost: 0,
            hpAfter: 100,
            arrivesAlive: true,
        });
    });

    it('plans a partial travel with all the food eaten and the rest uncovered (D-03, D-04)', () => {
        expect(
            planTravelFood({
                ...partial,
                hpBefore: 100,
                stacks: [stack(A, 20, 2)],
            }),
        ).toEqual({
            consumed: [{ itemId: A, quantity: 2 }],
            needed: 55,
            covered: 40,
            uncoveredKm: 5,
            hpLost: 15,
            hpAfter: 85,
            arrivesAlive: true,
        });
    });

    it('arrives alive with exactly one life point left (D-04, D-11)', () => {
        const plan = planTravelFood({
            ...partial,
            hpBefore: 16,
            stacks: [stack(A, 20, 2)],
        });
        expect(plan.hpAfter).toBe(1);
        expect(plan.arrivesAlive).toBe(true);
    });

    it('refuses to arrive at zero life points (D-04, D-11)', () => {
        const plan = planTravelFood({
            ...partial,
            hpBefore: 15,
            stacks: [stack(A, 20, 2)],
        });
        expect(plan.hpAfter).toBe(0);
        expect(plan.arrivesAlive).toBe(false);
    });

    it('charges the whole distance without food (D-02, D-03)', () => {
        expect(
            planTravelFood({
                durationMs: 16_012_800,
                distanceKm: 22.24,
                hpBefore: 1000,
                stacks: [],
            }),
        ).toEqual({
            consumed: [],
            needed: 89,
            covered: 0,
            uncoveredKm: 23,
            hpLost: 276,
            hpAfter: 724,
            arrivesAlive: true,
        });
    });
});
