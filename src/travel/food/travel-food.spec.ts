import { Types } from 'mongoose';
import { MIN_LIFE_POINTS } from 'src/quests/outcomes/progression/level-table';
import { FoodStack } from './food-selection';
import {
    coveredKmOf,
    FOOD_RULES,
    foodNeededFor,
    foodPlanOf,
    hpLostFor,
    hungerBetween,
    planTravelFood,
    travelHungerAt,
    TravelFoodCurve,
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

const GRID_DISTANCES = [
    0.44, 1, 2.7, 16, 20.37, 22.24, 49.999, 100, 400, 506.3,
];
const GRID_NEEDED = 100;
const GRID_COVERAGES = [0, 1, 33, 50, 99, 100, 105];

function steppedPartition(distanceKm: number, stepKm: number): number[] {
    const points: number[] = [];
    for (let index = 0; index * stepKm < distanceKm; index += 1)
        points.push(index * stepKm);
    return [...points, distanceKm];
}

function partitionsOf(curve: TravelFoodCurve): number[][] {
    const distanceKm = curve.distanceKm;
    return [
        steppedPartition(distanceKm, 1),
        steppedPartition(distanceKm, 0.37),
        steppedPartition(distanceKm, distanceKm / 7),
        [0, coveredKmOf(curve), distanceKm],
        [0, distanceKm],
    ];
}

describe('progressive hunger (Phase 20)', () => {
    const curve: TravelFoodCurve = {
        distanceKm: 20,
        uncoveredKm: 10,
        hpLostTotal: 55,
    };

    it('puts the covered kilometres first and clamps them at zero (D-02, D-13)', () => {
        expect(coveredKmOf({ distanceKm: 20, uncoveredKm: 10 })).toBe(10);
        expect(coveredKmOf({ distanceKm: 22.24, uncoveredKm: 23 })).toBe(0);
        expect(coveredKmOf({ distanceKm: 20.37, uncoveredKm: 21 })).toBe(0);
    });

    it('costs nothing inside the covered stretch (D-01)', () => {
        expect(travelHungerAt(curve, 0)).toBe(0);
        expect(travelHungerAt(curve, 10)).toBe(0);
    });

    it('charges the n-th uncovered kilometre once it is completed (D-02)', () => {
        expect(travelHungerAt(curve, 10.999)).toBe(0);
        expect(travelHungerAt(curve, 11)).toBe(1);
        expect(travelHungerAt(curve, 13)).toBe(6);
        expect(travelHungerAt(curve, 19.5)).toBe(45);
    });

    it('charges exactly the Phase 14 total at the destination (D-13)', () => {
        expect(travelHungerAt(curve, 20)).toBe(55);
        expect(travelHungerAt(curve, 25)).toBe(55);
        expect(
            travelHungerAt(
                { distanceKm: 22.24, uncoveredKm: 23, hpLostTotal: 276 },
                22.24,
            ),
        ).toBe(276);
    });

    it('charges the first uncovered kilometre early when the rounding exceeds the distance (D-13)', () => {
        const rounded = {
            distanceKm: 20.37,
            uncoveredKm: 21,
            hpLostTotal: 231,
        };

        expect(travelHungerAt(rounded, 0)).toBe(0);
        expect(travelHungerAt(rounded, 0.37)).toBe(1);
    });

    it('never gives a negative increment (D-16)', () => {
        expect(hungerBetween(curve, 13, 12.5)).toBe(0);
        expect(hungerBetween(curve, 13, 13)).toBe(0);
    });

    it('sums the increments to the Phase 14 total over any partition (D-13)', () => {
        let partitions = 0;
        for (const distanceKm of GRID_DISTANCES)
            for (const covered of GRID_COVERAGES) {
                const uncoveredKm = uncoveredKmOf(
                    GRID_NEEDED,
                    covered,
                    distanceKm,
                );
                const gridCurve = {
                    distanceKm,
                    uncoveredKm,
                    hpLostTotal: hpLostFor(uncoveredKm),
                };
                for (const points of partitionsOf(gridCurve)) {
                    const increments = points.slice(1).map((toKm, index) => ({
                        toKm,
                        hunger: hungerBetween(gridCurve, points[index], toKm),
                    }));
                    const total = increments.reduce(
                        (sum, step) => sum + step.hunger,
                        0,
                    );

                    expect(total).toBe(hpLostFor(uncoveredKm));
                    expect(increments.every((step) => step.hunger >= 0)).toBe(
                        true,
                    );
                    expect(
                        increments
                            .filter(
                                (step) => step.toKm <= coveredKmOf(gridCurve),
                            )
                            .every((step) => step.hunger === 0),
                    ).toBe(true);
                    partitions += 1;
                }
            }

        expect(partitions).toBe(350);
    });

    it('saves the departure plan with the covered boundary (D-05, D-13)', () => {
        expect(
            foodPlanOf(
                planTravelFood({
                    durationMs: 3_600_000,
                    distanceKm: 20,
                    hpBefore: 1000,
                    stacks: [stack(A, 1, 10)],
                }),
                20,
            ),
        ).toEqual({
            needed: 20,
            uncoveredKm: 10,
            coveredKm: 10,
            hpLostTotal: 55,
            settledKm: 0,
            foodConsumedAt: null,
        });
        expect(
            foodPlanOf(
                planTravelFood({
                    durationMs: 16_012_800,
                    distanceKm: 22.24,
                    hpBefore: 1000,
                    stacks: [],
                }),
                22.24,
            ),
        ).toEqual({
            needed: 89,
            uncoveredKm: 23,
            coveredKm: 0,
            hpLostTotal: 276,
            settledKm: 0,
            foodConsumedAt: null,
        });
    });
});
