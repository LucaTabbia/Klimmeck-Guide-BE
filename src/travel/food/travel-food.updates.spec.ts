import { Types } from 'mongoose';
import type { InventorySnapshot } from 'src/economy/trade/trade-inventory';
import type { TravelFoodPlan } from './travel-food';
import { mealGuardsOf, mealLinesOf, mealSetOf } from './travel-food.updates';

const A = new Types.ObjectId('64b0000000000000000000b1');
const B = new Types.ObjectId('64b0000000000000000000b2');
const C = new Types.ObjectId('64b0000000000000000000b3');

const planOf = (overrides: Partial<TravelFoodPlan>): TravelFoodPlan => ({
    consumed: [],
    needed: 0,
    covered: 0,
    uncoveredKm: 0,
    hpLost: 0,
    hpAfter: 100,
    arrivesAlive: true,
    ...overrides,
});

const loot = (item: Types.ObjectId, quantity: number) => ({
    itemType: 'LootItem' as const,
    item,
    quantity,
});

const stackGuard = (item: Types.ObjectId, quantity: number) => ({
    'assets.ownedItems': {
        $elemMatch: {
            item: { $in: [item, item.toHexString()] },
            quantity: { $gte: quantity },
        },
    },
});

describe('travel food write builders', () => {
    it('turns the consumed food into LootItem sell lines (D-12)', () => {
        expect(mealLinesOf([{ itemId: A, quantity: 2 }])).toEqual([
            { direction: 'sell', kind: 'LootItem', itemId: A, quantity: 2 },
        ]);
    });

    it('guards every consumed stack and the life points before the loss (D-12)', () => {
        const plan = planOf({
            consumed: [
                { itemId: A, quantity: 2 },
                { itemId: B, quantity: 1 },
            ],
            hpLost: 15,
            hpAfter: 85,
        });

        expect(mealGuardsOf(plan, 100)).toEqual({
            $and: [
                stackGuard(A, 2),
                stackGuard(B, 1),
                { 'status.currentLifePoints': 100 },
            ],
        });
    });

    it('guards a legacy character without life points with null (D-12)', () => {
        const plan = planOf({ hpLost: 5, hpAfter: 95 });

        expect(mealGuardsOf(plan, undefined)).toEqual({
            $and: [{ 'status.currentLifePoints': null }],
        });
    });

    it('adds no guard when nothing is eaten and no life is lost (D-12)', () => {
        expect(mealGuardsOf(planOf({}), 100)).toEqual({});
    });

    it('sets the remaining food and the life points after the loss (D-04, D-12)', () => {
        const assets: InventorySnapshot = {
            ownedItems: [loot(A, 2), loot(B, 1), loot(C, 3)],
        };
        const plan = planOf({
            consumed: [
                { itemId: A, quantity: 2 },
                { itemId: B, quantity: 1 },
            ],
            hpLost: 15,
            hpAfter: 85,
        });

        expect(mealSetOf(plan, assets)).toEqual({
            'assets.ownedItems': [loot(C, 3)],
            'status.currentLifePoints': 85,
        });
    });

    it('keeps a partially eaten stack with its remaining quantity (D-06)', () => {
        const plan = planOf({ consumed: [{ itemId: A, quantity: 1 }] });

        expect(mealSetOf(plan, { ownedItems: [loot(A, 3)] })).toEqual({
            'assets.ownedItems': [loot(A, 2)],
        });
    });

    it('sets only the life points of a travel without food (D-04)', () => {
        const plan = planOf({ hpLost: 276, hpAfter: 724 });

        expect(mealSetOf(plan, { ownedItems: [loot(A, 1)] })).toEqual({
            'status.currentLifePoints': 724,
        });
    });

    it('sets nothing when the travel costs neither food nor life (D-12)', () => {
        expect(mealSetOf(planOf({}), { ownedItems: [] })).toEqual({});
    });
});
