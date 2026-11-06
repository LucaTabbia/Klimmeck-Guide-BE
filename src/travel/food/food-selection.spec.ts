import { Types } from 'mongoose';
import { FoodStack, selectFood } from './food-selection';

const A = new Types.ObjectId('64b0000000000000000000a1');
const B = new Types.ObjectId('64b0000000000000000000a2');
const C = new Types.ObjectId('64b0000000000000000000a3');
const D = new Types.ObjectId('64b0000000000000000000a4');
const E = new Types.ObjectId('64b0000000000000000000a5');
const F = new Types.ObjectId('64b0000000000000000000a6');

function stack(
    itemId: Types.ObjectId,
    power: number,
    quantity: number,
    sellCopper = 1,
): FoodStack {
    return { itemId, power, quantity, sellCopper };
}

describe('food selection', () => {
    it('covers 60 with three 20 rather than a 50 and a 20 (D-06)', () => {
        expect(selectFood(60, [stack(A, 50, 1), stack(B, 20, 3)])).toEqual({
            consumed: [{ itemId: B, quantity: 3 }],
            covered: 60,
        });
    });

    it('prefers fewer units at equal waste: 60 with a 50 and a 10 (D-06)', () => {
        expect(
            selectFood(60, [stack(A, 50, 1), stack(B, 10, 1), stack(C, 20, 3)]),
        ).toEqual({
            consumed: [
                { itemId: A, quantity: 1 },
                { itemId: B, quantity: 1 },
            ],
            covered: 60,
        });
    });

    it('eats the only cover even when it wastes: 10 with a 200 (D-05)', () => {
        expect(selectFood(10, [stack(A, 200, 1)])).toEqual({
            consumed: [{ itemId: A, quantity: 1 }],
            covered: 200,
        });
    });

    it('eats everything when the food does not cover the need (D-04, D-06)', () => {
        expect(selectFood(55, [stack(A, 20, 1)])).toEqual({
            consumed: [{ itemId: A, quantity: 1 }],
            covered: 20,
        });
        expect(selectFood(100, [stack(A, 20, 2), stack(B, 10, 1)])).toEqual({
            consumed: [
                { itemId: A, quantity: 2 },
                { itemId: B, quantity: 1 },
            ],
            covered: 50,
        });
    });

    it('counts a stack of two as two separate units (D-06)', () => {
        expect(selectFood(40, [stack(A, 50, 1), stack(B, 20, 2)])).toEqual({
            consumed: [{ itemId: B, quantity: 2 }],
            covered: 40,
        });
        expect(
            selectFood(52, [stack(A, 50, 1), stack(B, 30, 1), stack(C, 25, 1)]),
        ).toEqual({
            consumed: [
                { itemId: B, quantity: 1 },
                { itemId: C, quantity: 1 },
            ],
            covered: 55,
        });
    });

    it('prefers the lower sell value at equal waste and units (D-06)', () => {
        expect(
            selectFood(60, [stack(A, 30, 2, 5), stack(B, 30, 2, 3)]),
        ).toEqual({ consumed: [{ itemId: B, quantity: 2 }], covered: 60 });
    });

    it('breaks a full tie by the lowest item id (D-06)', () => {
        expect(selectFood(20, [stack(B, 20, 1), stack(A, 20, 1)])).toEqual({
            consumed: [{ itemId: A, quantity: 1 }],
            covered: 20,
        });
    });

    it('consumes nothing when nothing is needed (D-01)', () => {
        expect(selectFood(0, [stack(A, 20, 3)])).toEqual({
            consumed: [],
            covered: 0,
        });
        expect(selectFood(10, [])).toEqual({ consumed: [], covered: 0 });
    });

    it('ignores stacks without a positive integer power or quantity (D-06)', () => {
        const invalid = [
            stack(A, 0, 1),
            stack(B, -5, 1),
            stack(C, 2.5, 1),
            stack(D, NaN, 1),
            stack(E, 20, 0),
            stack(new Types.ObjectId('64b0000000000000000000a7'), 20, 1.5),
        ];
        expect(selectFood(20, [...invalid, stack(F, 20, 1)])).toEqual({
            consumed: [{ itemId: F, quantity: 1 }],
            covered: 20,
        });
    });

    it('ignores a duplicate stack of the same item after the first (D-06)', () => {
        expect(selectFood(100, [stack(A, 20, 1), stack(A, 20, 5)])).toEqual({
            consumed: [{ itemId: A, quantity: 1 }],
            covered: 20,
        });
    });

    it('leaves out an item whose first entry is not edible: the inventory scales the first entry per id (D-06)', () => {
        expect(selectFood(20, [stack(A, 20, 0), stack(A, 20, 5)])).toEqual({
            consumed: [],
            covered: 0,
        });
    });

    it('lists the consumed food in the order of the owned items (D-17)', () => {
        expect(selectFood(60, [stack(C, 10, 1), stack(A, 50, 1)])).toEqual({
            consumed: [
                { itemId: C, quantity: 1 },
                { itemId: A, quantity: 1 },
            ],
            covered: 60,
        });
    });

    it('selects within the bound on huge stacks and needs (D-07)', () => {
        const huge = Array.from({ length: 33 }, (_, i) =>
            stack(
                new Types.ObjectId((0x1000 + i).toString(16).padStart(24, '0')),
                5 + 6 * i,
                2_000_000_000,
            ),
        );
        const started = performance.now();
        const selection = selectFood(16_460, huge);
        const elapsed = performance.now() - started;

        expect(selection.covered).toBeGreaterThanOrEqual(16_460);
        expect(selection.covered - 16_460).toBeLessThan(197);
        for (const eaten of selection.consumed) {
            expect(eaten.quantity).toBeLessThanOrEqual(2_000_000_000);
        }
        expect(elapsed).toBeLessThan(1000);
    });
});
