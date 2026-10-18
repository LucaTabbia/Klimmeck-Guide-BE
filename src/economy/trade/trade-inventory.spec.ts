import { Types } from 'mongoose';
import type { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import type { TradeLine } from './trade-line';
import {
    applyTradeToInventory,
    soldQuantityGuards,
    type InventoryEntry,
    type InventorySnapshot,
} from './trade-inventory';

const sword = new Types.ObjectId();
const potion = new Types.ObjectId();
const other = new Types.ObjectId();

const line = (
    direction: TradeLine['direction'],
    kind: TradeLine['kind'],
    itemId: Types.ObjectId,
    quantity: number,
): TradeLine => ({ direction, kind, itemId, quantity });

const loot = (item: unknown, quantity: number): InventoryEntry => ({
    itemType: 'LootItem',
    item,
    quantity,
});

const equipment = (item: unknown, quantity: number): InventoryEntry => ({
    itemType: 'EquipmentItem',
    item,
    quantity,
});

function codeThrownBy(action: () => unknown): GameRuleErrorCode | undefined {
    try {
        action();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

describe('trade inventory', () => {
    describe('applyTradeToInventory', () => {
        it('appends a bought equipment with its item type', () => {
            const outcome = applyTradeToInventory(
                { ownedItems: [], ownedEquipments: [] },
                [line('buy', 'EquipmentItem', sword, 1)],
            );

            expect(outcome).toEqual({
                ownedItems: [],
                ownedEquipments: [equipment(sword, 1)],
            });
        });

        it('appends a bought loot to ownedItems', () => {
            const outcome = applyTradeToInventory(
                { ownedItems: [], ownedEquipments: [] },
                [line('buy', 'LootItem', potion, 2)],
            );

            expect(outcome).toEqual({
                ownedItems: [loot(potion, 2)],
                ownedEquipments: [],
            });
        });

        it('increments an existing entry in place', () => {
            const outcome = applyTradeToInventory(
                {
                    ownedItems: [loot(other, 1), loot(potion, 1)],
                    ownedEquipments: [],
                },
                [line('buy', 'LootItem', potion, 2)],
            );

            expect(outcome.ownedItems).toEqual([
                loot(other, 1),
                loot(potion, 3),
            ]);
        });

        it('decrements a partially sold entry', () => {
            const outcome = applyTradeToInventory(
                { ownedItems: [loot(potion, 3)], ownedEquipments: [] },
                [line('sell', 'LootItem', potion, 1)],
            );

            expect(outcome.ownedItems).toEqual([loot(potion, 2)]);
        });

        it('removes an entry sold down to zero', () => {
            const outcome = applyTradeToInventory(
                { ownedItems: [], ownedEquipments: [equipment(sword, 1)] },
                [line('sell', 'EquipmentItem', sword, 1)],
            );

            expect(outcome.ownedEquipments).toEqual([]);
        });

        it('rejects selling an item not owned with ITEM_NOT_OWNED', () => {
            expect(
                codeThrownBy(() =>
                    applyTradeToInventory(
                        { ownedItems: [loot(other, 1)], ownedEquipments: [] },
                        [line('sell', 'LootItem', potion, 1)],
                    ),
                ),
            ).toBe('ITEM_NOT_OWNED');
        });

        it('rejects selling an equipment owned only as loot with ITEM_NOT_OWNED', () => {
            expect(
                codeThrownBy(() =>
                    applyTradeToInventory(
                        { ownedItems: [loot(sword, 1)], ownedEquipments: [] },
                        [line('sell', 'EquipmentItem', sword, 1)],
                    ),
                ),
            ).toBe('ITEM_NOT_OWNED');
        });

        it('rejects selling more than owned with INSUFFICIENT_ITEM_QUANTITY', () => {
            expect(
                codeThrownBy(() =>
                    applyTradeToInventory(
                        { ownedItems: [loot(potion, 1)], ownedEquipments: [] },
                        [line('sell', 'LootItem', potion, 2)],
                    ),
                ),
            ).toBe('INSUFFICIENT_ITEM_QUANTITY');
        });

        it('does not mutate the snapshot', () => {
            const snapshot: InventorySnapshot = {
                ownedItems: [loot(potion, 3), loot(other, 1)],
                ownedEquipments: [equipment(sword, 1)],
            };
            const before: InventorySnapshot = {
                ownedItems: [loot(potion, 3), loot(other, 1)],
                ownedEquipments: [equipment(sword, 1)],
            };

            applyTradeToInventory(snapshot, [
                line('sell', 'LootItem', potion, 1),
                line('sell', 'LootItem', other, 1),
                line('sell', 'EquipmentItem', sword, 1),
                line('buy', 'EquipmentItem', new Types.ObjectId(), 1),
            ]);

            expect(snapshot).toEqual(before);
        });

        it('matches legacy entries stored with a string item id', () => {
            const outcome = applyTradeToInventory(
                {
                    ownedItems: [loot(potion.toHexString(), 2)],
                    ownedEquipments: [],
                },
                [line('sell', 'LootItem', potion, 1)],
            );

            expect(outcome.ownedItems).toEqual([loot(potion.toHexString(), 1)]);
        });

        it('treats missing arrays as empty', () => {
            expect(
                applyTradeToInventory({}, [line('buy', 'LootItem', potion, 1)]),
            ).toEqual({ ownedItems: [loot(potion, 1)], ownedEquipments: [] });
        });
    });

    describe('soldQuantityGuards', () => {
        it('returns an empty guard when nothing is sold', () => {
            expect(
                soldQuantityGuards([line('buy', 'LootItem', potion, 1)]),
            ).toEqual({});
        });

        it('re-asserts every sold quantity with $elemMatch', () => {
            expect(
                soldQuantityGuards([
                    line('sell', 'EquipmentItem', sword, 1),
                    line('buy', 'LootItem', other, 4),
                    line('sell', 'LootItem', potion, 2),
                ]),
            ).toEqual({
                $and: [
                    {
                        'assets.ownedEquipments': {
                            $elemMatch: { item: sword, quantity: { $gte: 1 } },
                        },
                    },
                    {
                        'assets.ownedItems': {
                            $elemMatch: { item: potion, quantity: { $gte: 2 } },
                        },
                    },
                ],
            });
        });
    });
});
