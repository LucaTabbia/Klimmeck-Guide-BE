import { Types } from 'mongoose';
import { citySizeOf } from 'src/cities/city-size';
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    allowedRaritiesOf,
    hasShopOf,
    isShelfEligible,
    shelfInPoolOrder,
    shopTierOf,
} from './shop-pool.rules';

describe('hasShopOf', () => {
    it('opens the shop when one pool list has an item (D-04)', () => {
        expect(
            hasShopOf({
                shop: {
                    equipment: [],
                    loot: [new Types.ObjectId()],
                    pets: [],
                },
            }),
        ).toBe(true);
    });

    it('keeps the shop closed on three empty lists like Necrorian (D-04)', () => {
        expect(hasShopOf({ shop: { equipment: [], loot: [], pets: [] } })).toBe(
            false,
        );
    });

    it('keeps the shop closed on a city without pool lists (D-04)', () => {
        expect(hasShopOf({ shop: {} })).toBe(false);
    });

    it('keeps a city without the shop sub-document closed (D-10)', () => {
        expect([hasShopOf({}), hasShopOf({ shop: null })]).toEqual([
            false,
            false,
        ]);
    });
});

describe('isShelfEligible', () => {
    it('vetoes a legendary item from every shelf (D-05)', () => {
        expect(
            isShelfEligible({ rarity: RarityType.legendary, sellable: true }),
        ).toBe(false);
    });

    it('vetoes an item with sellable false (D-05)', () => {
        expect(
            isShelfEligible({ rarity: RarityType.common, sellable: false }),
        ).toBe(false);
    });

    it('shelves an item whose sellable is absent or null (D-05, A1)', () => {
        expect([
            isShelfEligible({ rarity: RarityType.common }),
            isShelfEligible({ rarity: RarityType.rare, sellable: null }),
        ]).toEqual([true, true]);
    });

    it('shelves a pet unless its sellable is false (D-05)', () => {
        expect([
            isShelfEligible({}),
            isShelfEligible({ sellable: true }),
            isShelfEligible({ sellable: false }),
        ]).toEqual([true, true, false]);
    });
});

describe('allowedRaritiesOf', () => {
    it('allows common and uncommon in a village, rare in a city, ultrarare in a capital and never legendary (D-08)', () => {
        expect({
            village: allowedRaritiesOf(CitySize.village),
            city: allowedRaritiesOf(CitySize.city),
            capital: allowedRaritiesOf(CitySize.capital),
        }).toEqual({
            village: ['common', 'uncommon'],
            city: ['common', 'uncommon', 'rare'],
            capital: ['common', 'uncommon', 'rare', 'ultrarare'],
        });
    });
});

describe('shopTierOf', () => {
    const CITY_TIER_CAPITALS: readonly CityType[] = [
        CityType.volucriCapital,
        CityType.dragonbornCapital,
    ];

    it('judges the shops of the two new capitals with the city tier (D-22)', () => {
        expect(shopTierOf(CityType.volucriCapital)).toBe(CitySize.city);
        expect(shopTierOf(CityType.dragonbornCapital)).toBe(CitySize.city);
    });

    it.each(
        Object.values(CityType).filter(
            (type) => !CITY_TIER_CAPITALS.includes(type),
        ),
    )(
        'keeps every other city type on the tier of its size (D-22): %s',
        (type) => {
            expect(shopTierOf(type)).toBe(citySizeOf(type));
        },
    );

    it('keeps an old capital and the dragonborn village on their size (D-22)', () => {
        expect(shopTierOf(CityType.drusteaCapital)).toBe(CitySize.capital);
        expect(shopTierOf(CityType.dragonbornVillage)).toBe(CitySize.village);
    });
});

describe('shelfInPoolOrder', () => {
    const shelved = (rarity: RarityType, sellable?: boolean) => ({
        _id: new Types.ObjectId(),
        rarity,
        sellable,
    });

    it('keeps the order of the stored pool and drops vetoed, missing and repeated ids (D-05, D-18)', () => {
        const a = shelved(RarityType.common);
        const b = shelved(RarityType.ultrarare, true);
        const legendary = shelved(RarityType.legendary, true);
        const vetoed = shelved(RarityType.common, false);
        const missing = new Types.ObjectId();

        expect(
            shelfInPoolOrder(
                [b._id, a._id, legendary._id, vetoed._id, missing, a._id],
                [a, legendary, vetoed, b],
            ),
        ).toEqual([b, a]);
    });

    it('reads ids curated as hex strings (D-03)', () => {
        const a = shelved(RarityType.common);
        const b = shelved(RarityType.rare);

        expect(
            shelfInPoolOrder(
                [b._id.toHexString(), 'not-an-id', 42, a._id],
                [a, b],
            ),
        ).toEqual([b, a]);
    });

    it('serves nothing from an absent pool (D-04)', () => {
        const a = shelved(RarityType.common);

        expect([
            shelfInPoolOrder(undefined, [a]),
            shelfInPoolOrder(null, [a]),
        ]).toEqual([[], []]);
    });
});
