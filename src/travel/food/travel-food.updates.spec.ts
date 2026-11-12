import { Types } from 'mongoose';
import { mealLinesOf } from './travel-food.updates';

const A = new Types.ObjectId('64b0000000000000000000b1');

describe('travel food write builders', () => {
    it('turns the consumed food into LootItem sell lines (D-12)', () => {
        expect(mealLinesOf([{ itemId: A, quantity: 2 }])).toEqual([
            { direction: 'sell', kind: 'LootItem', itemId: A, quantity: 2 },
        ]);
    });
});
