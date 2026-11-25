import { Types } from 'mongoose';
import type { FoodSettlement } from './travel-food-settlement';
import {
    questTravelSpendingOf,
    questTravelSpendingUpdateOf,
} from './quest-travel-spending';

const bread = new Types.ObjectId();
const cheese = new Types.ObjectId();

function settlementWith(
    overrides: Partial<FoodSettlement> = {},
): FoodSettlement {
    return {
        hpLoss: 0,
        lifeAfter: 20,
        settledKm: 10,
        consumed: [],
        ownedItems: null,
        foodConsumedAt: null,
        curve: null,
        ...overrides,
    };
}

describe('questTravelSpendingOf', () => {
    it('records the food eaten on the way (D-26)', () => {
        const settlement = settlementWith({
            consumed: [
                { itemId: bread, quantity: 3 },
                { itemId: cheese, quantity: 1 },
            ],
            ownedItems: [],
            foodConsumedAt: new Date('2026-11-25T10:00:00.000Z'),
        });

        expect(questTravelSpendingOf(settlement, 20)).toEqual({
            food: [
                { item: bread, quantity: 3 },
                { item: cheese, quantity: 1 },
            ],
            lifeLost: 0,
        });
    });

    it('records the life actually lost to hunger (D-13)', () => {
        const settlement = settlementWith({ hpLoss: 7, lifeAfter: 13 });

        expect(questTravelSpendingOf(settlement, 20)).toEqual({
            food: [],
            lifeLost: 7,
        });
    });

    it('records only the life above the minimum (D-13)', () => {
        const settlement = settlementWith({ hpLoss: 7, lifeAfter: 1 });

        expect(questTravelSpendingOf(settlement, 3)).toEqual({
            food: [],
            lifeLost: 2,
        });
    });

    it('records nothing when nothing was eaten or lost (D-26)', () => {
        expect(questTravelSpendingOf(null, 20)).toBeNull();
        expect(questTravelSpendingOf(settlementWith(), 20)).toBeNull();
    });
});

describe('questTravelSpendingUpdateOf', () => {
    it('appends the eaten lines and adds the lost life (D-13, D-26)', () => {
        const food = [
            { item: bread, quantity: 3 },
            { item: cheese, quantity: 1 },
        ];

        expect(questTravelSpendingUpdateOf({ food, lifeLost: 4 })).toEqual({
            $push: { travelFoodSpent: { $each: food } },
            $inc: { travelHungerLifeLost: 4 },
        });
    });

    it('writes only the parts that changed (D-26)', () => {
        const food = [{ item: bread, quantity: 2 }];

        expect(questTravelSpendingUpdateOf({ food: [], lifeLost: 4 })).toEqual({
            $inc: { travelHungerLifeLost: 4 },
        });
        expect(questTravelSpendingUpdateOf({ food, lifeLost: 0 })).toEqual({
            $push: { travelFoodSpent: { $each: food } },
        });
    });
});
