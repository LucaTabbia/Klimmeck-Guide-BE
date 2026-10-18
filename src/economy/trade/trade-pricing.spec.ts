import { Types } from 'mongoose';
import type { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import type { AssetQuantityInput } from 'src/models/common/asset-quantity.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';
import { priceKey, type CatalogPrice, type TradeLine } from './trade-line';
import {
    assertClientTotalMatches,
    planTradeLines,
    priceTrade,
} from './trade-pricing';

const sword = new Types.ObjectId();
const potion = new Types.ObjectId();
const relic = new Types.ObjectId();
const relicEquip = new Types.ObjectId();

interface TradeLists {
    boughtEquip?: AssetQuantityInput[];
    boughtLoot?: AssetQuantityInput[];
    soldEquip?: AssetQuantityInput[];
    soldLoot?: AssetQuantityInput[];
}

function request(
    lists: TradeLists = {},
    overrides: Partial<TransactionRequest> = {},
): TransactionRequest {
    return {
        id: new Types.ObjectId().toHexString(),
        boughtItems: {
            equipAssets: lists.boughtEquip ?? [],
            lootAssets: lists.boughtLoot ?? [],
        },
        soldItems: {
            equipAssets: lists.soldEquip ?? [],
            lootAssets: lists.soldLoot ?? [],
        },
        total: { gold: 0, silver: 0, copper: 0 },
        isTotalPositive: false,
        ...overrides,
    };
}

const asset = (
    item: string | null | undefined,
    quantity = 1,
): AssetQuantityInput => ({ item, quantity });

const of = (id: Types.ObjectId, quantity = 1) =>
    asset(id.toHexString(), quantity);

function codeThrownBy(action: () => unknown): GameRuleErrorCode | undefined {
    try {
        action();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

const coins = (gold: number, silver: number, copper: number) => ({
    gold,
    silver,
    copper,
});

describe('trade pricing', () => {
    describe('planTradeLines', () => {
        it('maps the four lists to typed lines in a fixed order', () => {
            const lines = planTradeLines(
                request({
                    soldLoot: [of(relic, 3)],
                    soldEquip: [of(relicEquip)],
                    boughtLoot: [of(potion, 2)],
                    boughtEquip: [of(sword)],
                }),
            );

            expect(lines).toEqual([
                {
                    direction: 'buy',
                    kind: 'EquipmentItem',
                    itemId: sword,
                    quantity: 1,
                },
                {
                    direction: 'buy',
                    kind: 'LootItem',
                    itemId: potion,
                    quantity: 2,
                },
                {
                    direction: 'sell',
                    kind: 'EquipmentItem',
                    itemId: relicEquip,
                    quantity: 1,
                },
                {
                    direction: 'sell',
                    kind: 'LootItem',
                    itemId: relic,
                    quantity: 3,
                },
            ]);
            lines.forEach((line) =>
                expect(line.itemId).toBeInstanceOf(Types.ObjectId),
            );
        });

        it('returns no lines for an empty trade', () => {
            expect(planTradeLines(request())).toEqual([]);
        });

        it.each([null, undefined, 'abc', '64B0000000000000000000AA'])(
            'rejects item id %p with ITEM_NOT_FOUND',
            (item) => {
                expect(
                    codeThrownBy(() =>
                        planTradeLines(request({ boughtLoot: [asset(item)] })),
                    ),
                ).toBe('ITEM_NOT_FOUND');
            },
        );

        it.each([0, -1, 1.5])(
            'rejects quantity %p with INVALID_QUANTITY',
            (quantity) => {
                expect(
                    codeThrownBy(() =>
                        planTradeLines(
                            request({ soldLoot: [of(potion, quantity)] }),
                        ),
                    ),
                ).toBe('INVALID_QUANTITY');
            },
        );

        it('rejects the same item twice in one direction with INVALID_QUANTITY', () => {
            expect(
                codeThrownBy(() =>
                    planTradeLines(
                        request({ boughtEquip: [of(sword), of(sword)] }),
                    ),
                ),
            ).toBe('INVALID_QUANTITY');
        });

        it('rejects the same item bought and sold with INVALID_QUANTITY', () => {
            expect(
                codeThrownBy(() =>
                    planTradeLines(
                        request({
                            boughtLoot: [of(potion)],
                            soldLoot: [of(potion)],
                        }),
                    ),
                ),
            ).toBe('INVALID_QUANTITY');
        });

        it('accepts the same hex in the equipment and loot lists', () => {
            const lines = planTradeLines(
                request({ boughtEquip: [of(sword)], soldLoot: [of(sword)] }),
            );

            expect(lines.map((line) => line.kind)).toEqual([
                'EquipmentItem',
                'LootItem',
            ]);
        });
    });

    describe('priceTrade', () => {
        const swordPrice: CatalogPrice = {
            buyPrice: coins(0, 1, 50),
            sellPrice: coins(0, 0, 75),
        };
        const prices = new Map<string, CatalogPrice>([
            [priceKey('EquipmentItem', sword), swordPrice],
            [
                priceKey('LootItem', potion),
                { buyPrice: coins(0, 0, 20), sellPrice: coins(0, 0, 10) },
            ],
            [priceKey('LootItem', relic), { buyPrice: null, sellPrice: null }],
        ]);

        const line = (
            direction: TradeLine['direction'],
            kind: TradeLine['kind'],
            itemId: Types.ObjectId,
            quantity = 1,
        ): TradeLine => ({ direction, kind, itemId, quantity });

        it('sums catalog prices by quantity and nets sells against buys', () => {
            expect(
                priceTrade(
                    [
                        line('buy', 'EquipmentItem', sword, 2),
                        line('sell', 'LootItem', potion, 3),
                    ],
                    prices,
                ),
            ).toEqual({
                totalBuyCopper: 300,
                totalSellCopper: 30,
                netCopper: -270,
            });
        });

        it('reads non-normalized catalog prices', () => {
            const raw = new Map<string, CatalogPrice>([
                [
                    priceKey('EquipmentItem', sword),
                    { buyPrice: coins(0, 0, 150) },
                ],
            ]);

            expect(
                priceTrade([line('buy', 'EquipmentItem', sword)], raw)
                    .totalBuyCopper,
            ).toBe(150);
        });

        it('rejects a line missing from the catalog with ITEM_NOT_FOUND', () => {
            expect(
                codeThrownBy(() =>
                    priceTrade([line('buy', 'LootItem', sword)], prices),
                ),
            ).toBe('ITEM_NOT_FOUND');
        });

        it('rejects a null buy price with ITEM_NOT_TRADABLE', () => {
            expect(
                codeThrownBy(() =>
                    priceTrade([line('buy', 'LootItem', relic)], prices),
                ),
            ).toBe('ITEM_NOT_TRADABLE');
        });

        it('rejects a null sell price with ITEM_NOT_TRADABLE', () => {
            expect(
                codeThrownBy(() =>
                    priceTrade([line('sell', 'LootItem', relic)], prices),
                ),
            ).toBe('ITEM_NOT_TRADABLE');
        });

        it('rejects an unsafe total with INVALID_QUANTITY', () => {
            const expensive = new Map<string, CatalogPrice>([
                [
                    priceKey('EquipmentItem', sword),
                    { buyPrice: coins(1000, 0, 0) },
                ],
            ]);

            expect(
                codeThrownBy(() =>
                    priceTrade(
                        [line('buy', 'EquipmentItem', sword, 2147483647)],
                        expensive,
                    ),
                ),
            ).toBe('INVALID_QUANTITY');
        });

        it('prices an empty trade at zero', () => {
            expect(priceTrade([], prices)).toEqual({
                totalBuyCopper: 0,
                totalSellCopper: 0,
                netCopper: 0,
            });
        });
    });

    describe('assertClientTotalMatches', () => {
        const client = (
            total: { gold: number; silver: number; copper: number },
            isTotalPositive: boolean,
        ) => ({ total, isTotalPositive });

        it('accepts a matching negative net', () => {
            expect(() =>
                assertClientTotalMatches(client(coins(0, 2, 70), false), -270),
            ).not.toThrow();
        });

        it('accepts a matching positive net', () => {
            expect(() =>
                assertClientTotalMatches(client(coins(0, 0, 85), true), 85),
            ).not.toThrow();
        });

        it.each([true, false])(
            'accepts a zero total for a zero net with isTotalPositive %p',
            (isTotalPositive) => {
                expect(() =>
                    assertClientTotalMatches(
                        client(coins(0, 0, 0), isTotalPositive),
                        0,
                    ),
                ).not.toThrow();
            },
        );

        it('accepts a non-normalized client total', () => {
            expect(() =>
                assertClientTotalMatches(client(coins(0, 0, 270), false), -270),
            ).not.toThrow();
        });

        it('rejects a different amount with TRANSACTION_TOTAL_MISMATCH', () => {
            expect(
                codeThrownBy(() =>
                    assertClientTotalMatches(
                        client(coins(0, 0, 1), false),
                        -270,
                    ),
                ),
            ).toBe('TRANSACTION_TOTAL_MISMATCH');
        });

        it('rejects the wrong sign with TRANSACTION_TOTAL_MISMATCH', () => {
            expect(
                codeThrownBy(() =>
                    assertClientTotalMatches(
                        client(coins(0, 2, 70), true),
                        -270,
                    ),
                ),
            ).toBe('TRANSACTION_TOTAL_MISMATCH');
        });

        it.each([
            ['a negative', coins(0, -1, 0), -100],
            ['a fractional', coins(0, 0, 1.5), -1.5],
        ])(
            'rejects %s denomination with TRANSACTION_TOTAL_MISMATCH',
            (_name, total, net) => {
                expect(
                    codeThrownBy(() =>
                        assertClientTotalMatches(client(total, false), net),
                    ),
                ).toBe('TRANSACTION_TOTAL_MISMATCH');
            },
        );
    });
});
