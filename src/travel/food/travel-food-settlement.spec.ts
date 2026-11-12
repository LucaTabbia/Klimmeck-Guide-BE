import { Types } from 'mongoose';
import type {
    InventoryEntry,
    InventorySnapshot,
} from 'src/economy/trade/trade-inventory';
import type { FoodStack } from './food-selection';
import type { ActiveTravelFoodDraft } from './travel-food';
import {
    FoodLeg,
    FoodMoment,
    FoodSettlement,
    foodLegOf,
    reachedKmOf,
    settlementIsDue,
    settlementOf,
} from './travel-food-settlement';

const F1 = new Types.ObjectId('64b000000000000000000001');
const F20 = new Types.ObjectId('64b000000000000000000020');
const NOW = new Date('2026-11-12T09:00:00.000Z');
const EATEN_AT = new Date('2026-11-12T08:30:00.000Z');
const LIFE = 1000;

const SHORT_ROAD_KM = 20;
const SHORT_ROAD_MS = 3_600_000;
const LONG_ROAD_KM = 400;
const LONG_ROAD_MS = 144_000_000;

const entry = (item: Types.ObjectId, quantity: number): InventoryEntry => ({
    itemType: 'LootItem',
    item,
    quantity,
});

const stack = (
    itemId: Types.ObjectId,
    power: number,
    quantity: number,
): FoodStack => ({ itemId, power, sellCopper: 1, quantity });

const shortPlan = (
    overrides: Partial<ActiveTravelFoodDraft> = {},
): ActiveTravelFoodDraft => ({
    needed: 20,
    uncoveredKm: 10,
    coveredKm: 10,
    hpLostTotal: 55,
    settledKm: 0,
    foodConsumedAt: null,
    ...overrides,
});

const longPlan = (
    overrides: Partial<ActiveTravelFoodDraft> = {},
): ActiveTravelFoodDraft => ({
    needed: 800,
    uncoveredKm: 120,
    coveredKm: 280,
    hpLostTotal: 7260,
    settledKm: 0,
    foodConsumedAt: null,
    ...overrides,
});

const shortLeg = (food: ActiveTravelFoodDraft = shortPlan()): FoodLeg => ({
    food,
    distanceKm: SHORT_ROAD_KM,
    durationMs: SHORT_ROAD_MS,
});

const longLeg = (food: ActiveTravelFoodDraft = longPlan()): FoodLeg => ({
    food,
    distanceKm: LONG_ROAD_KM,
    durationMs: LONG_ROAD_MS,
});

interface Pantry {
    assets: InventorySnapshot;
    stacks: FoodStack[];
}

const tenF1: Pantry = {
    assets: { ownedItems: [entry(F1, 10)] },
    stacks: [stack(F1, 1, 10)],
};

const fourF1: Pantry = {
    assets: { ownedItems: [entry(F1, 4)] },
    stacks: [stack(F1, 1, 4)],
};

const emptyPantry: Pantry = { assets: { ownedItems: [] }, stacks: [] };

const twentyEightF20: Pantry = {
    assets: { ownedItems: [entry(F20, 28)] },
    stacks: [stack(F20, 20, 28)],
};

const settle = (
    leg: FoodLeg,
    targetKm: number,
    moment: FoodMoment,
    pantry: Pantry = tenF1,
    lifeNow = LIFE,
): FoodSettlement | null =>
    settlementOf({
        leg,
        targetKm,
        moment,
        lifeNow,
        assets: pantry.assets,
        stacks: pantry.stacks,
        now: NOW,
    });

const afterMeal = (settledKm: number): ActiveTravelFoodDraft =>
    shortPlan({ settledKm, foodConsumedAt: EATEN_AT });

describe('food settlement', () => {
    it('writes nothing inside the covered stretch (D-01, D-15)', () => {
        expect(settle(shortLeg(), 5, 'progress')).toBeNull();
    });

    it('eats the whole plan at the end of the covered kilometres (D-03)', () => {
        expect(settle(shortLeg(), 10, 'progress')).toEqual({
            hpLoss: 0,
            lifeAfter: 1000,
            settledKm: 10,
            consumed: [{ itemId: F1, quantity: 10 }],
            ownedItems: [],
            foodConsumedAt: NOW,
            curve: null,
        });
    });

    it('charges the incremental hunger past the boundary (D-01, D-02)', () => {
        expect(settle(shortLeg(afterMeal(10)), 13, 'progress')).toEqual({
            hpLoss: 6,
            lifeAfter: 994,
            settledKm: 13,
            consumed: [],
            ownedItems: null,
            foodConsumedAt: null,
            curve: null,
        });
    });

    it('never charges the same kilometres twice (D-14, D-16)', () => {
        expect(settle(shortLeg(afterMeal(13)), 13, 'progress')).toBeNull();
        expect(settle(shortLeg(afterMeal(13)), 12.5, 'progress')).toBeNull();
    });

    it('never lowers the life under one (D-01)', () => {
        const settlement = settle(
            shortLeg(afterMeal(10)),
            20,
            'progress',
            tenF1,
            3,
        );
        expect(settlement?.hpLoss).toBe(55);
        expect(settlement?.lifeAfter).toBe(1);
    });

    it('does not lower a life above the maximum to the maximum (D-14)', () => {
        const settlement = settle(
            shortLeg(afterMeal(10)),
            13,
            'progress',
            tenF1,
            1200,
        );
        expect(settlement?.lifeAfter).toBe(1194);
    });

    it('records the boundary meal even with nothing to eat (D-03)', () => {
        const leg = shortLeg(
            shortPlan({ uncoveredKm: 20, coveredKm: 0, hpLostTotal: 210 }),
        );
        const settlement = settle(leg, 0.5, 'progress', emptyPantry);
        expect(settlement).not.toBeNull();
        expect(settlement?.consumed).toEqual([]);
        expect(settlement?.ownedItems).toBeNull();
        expect(settlement?.foodConsumedAt).toEqual(NOW);
        expect(settlement?.hpLoss).toBe(0);
    });

    it('eats nothing twice once the meal is recorded (D-03)', () => {
        const settlement = settle(shortLeg(afterMeal(10)), 15, 'progress');
        expect(settlement?.consumed).toEqual([]);
        expect(settlement?.foodConsumedAt).toBeNull();
        expect(settlement?.hpLoss).toBe(15);
    });

    it('charges the hunger left and eats the whole need on arrival (D-03, D-07)', () => {
        const settlement = settle(shortLeg(), 20, 'arrival');
        expect(settlement?.hpLoss).toBe(55);
        expect(settlement?.consumed).toEqual([{ itemId: F1, quantity: 10 }]);
    });

    it('charges only the kilometres after the settled ones on arrival (D-07)', () => {
        const settlement = settle(shortLeg(afterMeal(13)), 20, 'arrival');
        expect(settlement?.hpLoss).toBe(49);
        expect(settlement?.consumed).toEqual([]);
    });

    it('eats only the food of the travelled kilometres on a stop (D-03, D-06)', () => {
        const settlement = settle(longLeg(), 30, 'stop', twentyEightF20);
        expect(settlement?.consumed).toEqual([{ itemId: F20, quantity: 3 }]);
        expect(settlement?.ownedItems).toEqual([entry(F20, 25)]);
        expect(settlement?.hpLoss).toBe(0);
    });

    it('eats the whole need on a stop at the destination (D-03)', () => {
        const settlement = settle(longLeg(), 400, 'stop', twentyEightF20);
        expect(settlement?.consumed).toEqual([{ itemId: F20, quantity: 28 }]);
        expect(settlement?.hpLoss).toBe(7260);
        expect(settlement?.lifeAfter).toBe(1);
    });

    it('eats the boundary food on a stop past the boundary (D-03, D-06)', () => {
        const stop = settle(longLeg(), 290, 'stop', twentyEightF20);
        const progress = settle(longLeg(), 290, 'progress', twentyEightF20);
        expect(stop?.consumed).toEqual(progress?.consumed);
        expect(stop?.ownedItems).toEqual(progress?.ownedItems);
        expect(stop?.consumed).toEqual([{ itemId: F20, quantity: 28 }]);
    });

    it('eats the whole need on a stop of a road without length (D-03)', () => {
        const leg: FoodLeg = { ...shortLeg(), distanceKm: 0 };
        const settlement = settle(leg, 0, 'stop', {
            assets: { ownedItems: [entry(F1, 30)] },
            stacks: [stack(F1, 1, 30)],
        });
        expect(settlement?.consumed).toEqual([{ itemId: F1, quantity: 20 }]);
    });

    it('rewrites the uncovered kilometres when the pantry covers less than the plan (D-19)', () => {
        const settlement = settle(shortLeg(), 10, 'progress', fourF1);
        expect(settlement?.consumed).toEqual([{ itemId: F1, quantity: 4 }]);
        expect(settlement?.curve).toEqual({
            uncoveredKm: 16,
            coveredKm: 4,
            hpLostTotal: 136,
        });
        expect(settlement?.hpLoss).toBe(21);
        expect(settlement?.lifeAfter).toBe(979);
    });

    it('keeps the saved curve when the pantry covers the plan (D-19)', () => {
        expect(settle(shortLeg(), 10, 'progress')?.curve).toBeNull();
    });

    it('sums the settlements of a whole travel to the Phase 14 total (D-02, D-13)', () => {
        const steps: [number, FoodMoment][] = [
            [10, 'progress'],
            [11, 'progress'],
            [13.5, 'progress'],
            [17, 'progress'],
            [20, 'arrival'],
        ];
        let food = shortPlan();
        let life = LIFE;
        let pantry = tenF1;
        const settlements: FoodSettlement[] = [];
        for (const [km, moment] of steps) {
            const settlement = settle(shortLeg(food), km, moment, pantry, life);
            if (!settlement) continue;
            settlements.push(settlement);
            life = settlement.lifeAfter;
            food = {
                ...food,
                ...(settlement.curve ?? {}),
                settledKm: settlement.settledKm,
                foodConsumedAt:
                    settlement.foodConsumedAt ?? food.foodConsumedAt,
            };
            if (settlement.ownedItems) {
                pantry = {
                    assets: { ownedItems: settlement.ownedItems },
                    stacks: [],
                };
            }
        }
        expect(settlements.reduce((sum, s) => sum + s.hpLoss, 0)).toBe(55);
        expect(settlements.filter((s) => s.consumed.length > 0)).toHaveLength(
            1,
        );
    });

    it('is due only past the boundary or when the meal is pending (D-15)', () => {
        expect(settlementIsDue(shortLeg(), 5)).toBe(false);
        expect(settlementIsDue(shortLeg(), 10)).toBe(true);
        expect(settlementIsDue(shortLeg(afterMeal(10)), 10.5)).toBe(false);
        expect(settlementIsDue(shortLeg(afterMeal(10)), 11)).toBe(true);
    });

    it('stops at a pending ambush kilometre (D-16, D-17)', () => {
        const travel = {
            road: { distance: SHORT_ROAD_KM },
            startTime: new Date('2026-11-12T08:00:00.000Z'),
            duration: SHORT_ROAD_MS,
        };
        const at = new Date('2026-11-12T08:45:00.000Z');
        expect(reachedKmOf(travel, at)).toBe(15);
        expect(reachedKmOf({ ...travel, ambush: { km: 12 } }, at)).toBe(12);
        expect(reachedKmOf({ ...travel, ambush: null }, at)).toBe(15);
    });

    it('reads a valid saved plan and rejects malformed ones (D-11)', () => {
        const savedFood = {
            needed: 20,
            uncoveredKm: 10,
            coveredKm: 10,
            hpLostTotal: 55,
            settledKm: 0,
        };
        const withoutFood = {
            road: { distance: SHORT_ROAD_KM },
            startTime: new Date('2026-11-12T08:00:00.000Z'),
            duration: SHORT_ROAD_MS,
        };
        const travel = { ...withoutFood, food: savedFood };
        expect(foodLegOf(travel)).toEqual({
            food: shortPlan(),
            distanceKm: 20,
            durationMs: 3_600_000,
        });
        expect(
            foodLegOf({
                ...travel,
                food: { ...savedFood, foodConsumedAt: EATEN_AT },
            })?.food.foodConsumedAt,
        ).toEqual(EATEN_AT);
        const malformed: unknown[] = [
            undefined,
            withoutFood,
            { ...travel, food: { ...savedFood, needed: 'x' } },
            { ...travel, food: { ...savedFood, uncoveredKm: 2.5 } },
            { ...travel, food: { ...savedFood, settledKm: -1 } },
            { ...travel, food: { ...savedFood, hpLostTotal: 54 } },
            { ...travel, road: { distance: 0 } },
            { ...travel, duration: -1 },
            { food: savedFood },
            { ...travel, food: { ...savedFood, foodConsumedAt: 'yesterday' } },
        ];
        for (const candidate of malformed) {
            expect(foodLegOf(candidate)).toBeNull();
        }
    });
});
