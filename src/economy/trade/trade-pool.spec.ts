import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    priceKey,
    type CatalogPrice,
    type CatalogPrices,
    type TradeItemKind,
    type TradeLine,
} from './trade-line';
import { assertBuysInShop, poolOfCity, type CityPool } from './trade-pool';

const sword = new Types.ObjectId();
const potion = new Types.ObjectId();
const horse = new Types.ObjectId();
const crown = new Types.ObjectId();

const PRICE = { buyPrice: { gold: 0, silver: 1, copper: 0 } };

const line = (
    direction: TradeLine['direction'],
    kind: TradeItemKind,
    itemId: Types.ObjectId,
): TradeLine => ({ direction, kind, itemId, quantity: 1 });

const catalogueOf = (
    entries: [TradeItemKind, Types.ObjectId, CatalogPrice][],
): CatalogPrices =>
    new Map(entries.map(([kind, id, price]) => [priceKey(kind, id), price]));

const catalogue = catalogueOf([
    ['EquipmentItem', sword, PRICE],
    ['LootItem', potion, PRICE],
    ['Pet', horse, PRICE],
]);

const fullPool: CityPool = {
    equipment: [sword],
    loot: [potion],
    pets: [horse],
};

const emptyPool: CityPool = { equipment: [], loot: [], pets: [] };

function codeThrownBy(action: () => unknown): GameRuleErrorCode | undefined {
    try {
        action();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

describe('trade pool', () => {
    it('accepts a purchase of an item in the pool of the city (D-19)', () => {
        expect(
            codeThrownBy(() =>
                assertBuysInShop(
                    [
                        line('buy', 'EquipmentItem', sword),
                        line('buy', 'LootItem', potion),
                        line('buy', 'Pet', horse),
                    ],
                    fullPool,
                    catalogue,
                ),
            ),
        ).toBeUndefined();
    });

    it.each<[TradeItemKind, Types.ObjectId]>([
        ['EquipmentItem', sword],
        ['LootItem', potion],
        ['Pet', horse],
    ])(
        'refuses an equipment, a loot and a pet outside the pool with ITEM_NOT_IN_SHOP (D-19): %s',
        (kind, id) => {
            const pool: CityPool = {
                equipment: kind === 'EquipmentItem' ? [] : [sword],
                loot: kind === 'LootItem' ? [] : [potion],
                pets: kind === 'Pet' ? [] : [horse],
            };

            expect(
                codeThrownBy(() =>
                    assertBuysInShop([line('buy', kind, id)], pool, catalogue),
                ),
            ).toBe(GameRuleErrorCode.ITEM_NOT_IN_SHOP);
        },
    );

    it('refuses an item of the pool of another kind (D-19)', () => {
        const pool: CityPool = { equipment: [potion], loot: [], pets: [] };

        expect(
            codeThrownBy(() =>
                assertBuysInShop(
                    [line('buy', 'LootItem', potion)],
                    pool,
                    catalogue,
                ),
            ),
        ).toBe(GameRuleErrorCode.ITEM_NOT_IN_SHOP);
    });

    it.each<[string, CatalogPrice]>([
        ['legendary', { ...PRICE, rarity: RarityType.legendary }],
        ['sellable false', { ...PRICE, sellable: false }],
    ])(
        'refuses a legendary or a sellable false item even when curated in the pool (D-05, D-19): %s',
        (_label, price) => {
            const vetoed = catalogueOf([['EquipmentItem', crown, price]]);

            expect(
                codeThrownBy(() =>
                    assertBuysInShop(
                        [line('buy', 'EquipmentItem', crown)],
                        { equipment: [crown], loot: [], pets: [] },
                        vetoed,
                    ),
                ),
            ).toBe(GameRuleErrorCode.ITEM_NOT_IN_SHOP);
        },
    );

    it('refuses a pool item missing from the catalogue (D-19)', () => {
        expect(
            codeThrownBy(() =>
                assertBuysInShop(
                    [line('buy', 'EquipmentItem', crown)],
                    { equipment: [crown], loot: [], pets: [] },
                    catalogue,
                ),
            ),
        ).toBe(GameRuleErrorCode.ITEM_NOT_IN_SHOP);
    });

    it('never checks the pool on a sale, a legendary included (D-11, D-12)', () => {
        const legendary = catalogueOf([
            [
                'EquipmentItem',
                crown,
                { sellPrice: PRICE.buyPrice, rarity: RarityType.legendary },
            ],
        ]);

        expect(
            codeThrownBy(() =>
                assertBuysInShop(
                    [
                        line('sell', 'EquipmentItem', crown),
                        line('sell', 'LootItem', potion),
                        line('sell', 'Pet', horse),
                    ],
                    emptyPool,
                    legendary,
                ),
            ),
        ).toBeUndefined();
    });

    it('reads pool ids curated as hex strings (D-19)', () => {
        const curated = poolOfCity({
            shopEquipment: [sword.toHexString()],
            shopLoot: [potion.toHexString()],
            shopPets: [horse.toHexString()],
        });

        expect(
            codeThrownBy(() =>
                assertBuysInShop(
                    [
                        line('buy', 'EquipmentItem', sword),
                        line('buy', 'LootItem', potion),
                        line('buy', 'Pet', horse),
                    ],
                    curated,
                    catalogue,
                ),
            ),
        ).toBeUndefined();
    });

    it('reads an unseeded city as an empty pool (D-19)', () => {
        const unseeded = poolOfCity({});

        expect(unseeded).toEqual(emptyPool);
        expect(
            codeThrownBy(() =>
                assertBuysInShop(
                    [line('buy', 'EquipmentItem', sword)],
                    unseeded,
                    catalogue,
                ),
            ),
        ).toBe(GameRuleErrorCode.ITEM_NOT_IN_SHOP);
    });

    it('reads null pool lists as empty (D-19)', () => {
        expect(
            poolOfCity({ shopEquipment: null, shopLoot: null, shopPets: null }),
        ).toEqual(emptyPool);
    });
});
