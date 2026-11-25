import { Types } from 'mongoose';
import { MAX_ITEM_QUANTITY } from 'src/economy/trade/trade-inventory';
import {
    homeCityFilterOf,
    refundedLifeOf,
    startedQuestsWithFilter,
    travelRefundOf,
} from './started-quest-cancel';

describe('started quest cancellation rules (account deletion)', () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const ration = new Types.ObjectId();
    const bread = new Types.ObjectId();

    it('selects only the effectively started quests of these characters (D-26)', () => {
        expect(startedQuestsWithFilter([a, b])).toEqual({
            concludedAt: null,
            startedAt: { $ne: null },
            'registeredAdventurers.character': {
                $in: [a, a.toHexString(), b, b.toHexString()],
            },
        });
    });

    it('finds the home city as the city holding the quest marker (D-26)', () => {
        const marker = new Types.ObjectId();
        expect(homeCityFilterOf(marker)).toEqual({
            pointsOfInterest: { $in: [marker, marker.toHexString()] },
        });
    });

    it('merges the food of the trip back into the bag (D-13)', () => {
        expect(
            travelRefundOf(
                [{ itemType: 'LootItem', item: ration, quantity: 2 }],
                [
                    { item: ration, quantity: 1 },
                    { item: bread, quantity: 3 },
                ],
            ),
        ).toEqual([
            { itemType: 'LootItem', item: ration, quantity: 3 },
            { itemType: 'LootItem', item: bread, quantity: 3 },
        ]);
    });

    it('merges two spent rows of the same food (D-13)', () => {
        expect(
            travelRefundOf(undefined, [
                { item: ration, quantity: 1 },
                { item: ration.toHexString(), quantity: 2 },
            ]),
        ).toEqual([{ itemType: 'LootItem', item: ration, quantity: 3 }]);
    });

    it('gives nothing back when nothing was spent (D-13)', () => {
        const bag = [
            { itemType: 'LootItem' as const, item: ration, quantity: 2 },
        ];
        expect(travelRefundOf(bag, undefined)).toBeNull();
        expect(travelRefundOf(bag, [])).toBeNull();
    });

    it('ignores malformed spent lines (D-13)', () => {
        expect(
            travelRefundOf(
                [],
                [
                    { item: null, quantity: 2 },
                    { item: 'not-an-id', quantity: 2 },
                    { item: ration, quantity: 0 },
                    { item: ration, quantity: -1 },
                    { item: ration, quantity: 1.5 },
                    { item: ration, quantity: '2' },
                    { item: bread, quantity: 1 },
                ],
            ),
        ).toEqual([{ itemType: 'LootItem', item: bread, quantity: 1 }]);
        expect(travelRefundOf([], [{ item: ration, quantity: 0 }])).toBeNull();
    });

    it('caps the refund at the maximum quantity of a bag row (D-13)', () => {
        expect(
            travelRefundOf(
                [
                    {
                        itemType: 'LootItem',
                        item: ration,
                        quantity: MAX_ITEM_QUANTITY - 1,
                    },
                ],
                [{ item: ration, quantity: 5 }],
            ),
        ).toEqual([
            { itemType: 'LootItem', item: ration, quantity: MAX_ITEM_QUANTITY },
        ]);
        expect(
            travelRefundOf(
                [
                    {
                        itemType: 'LootItem',
                        item: ration,
                        quantity: MAX_ITEM_QUANTITY,
                    },
                ],
                [{ item: ration, quantity: 5 }],
            ),
        ).toBeNull();
    });

    it('gives the hunger back up to the maximum life (D-13)', () => {
        expect(refundedLifeOf(10, 5, 20)).toBe(15);
        expect(refundedLifeOf(18, 5, 20)).toBe(20);
        expect(refundedLifeOf(25, 5, 20)).toBe(25);
    });

    it('keeps the life as it is when no hunger was recorded (D-13)', () => {
        expect(refundedLifeOf(10, 0, 20)).toBe(10);
        expect(refundedLifeOf(10, -3, 20)).toBe(10);
        expect(refundedLifeOf(10, Number.NaN, 20)).toBe(10);
    });
});
