import { Types } from 'mongoose';
import { CitySize } from 'src/models/enums/city-size.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    allowedRaritiesOf,
    hasShopOf,
    isSeedCandidate,
    isShelfEligible,
} from './shop-pool.rules';

describe('hasShopOf', () => {
    it('opens the shop when one pool list has an item (D-04)', () => {
        expect(
            hasShopOf({
                shopEquipment: [],
                shopLoot: [new Types.ObjectId()],
                shopPets: [],
            }),
        ).toBe(true);
    });

    it('keeps the shop closed on three empty lists like Necrorian (D-04)', () => {
        expect(
            hasShopOf({ shopEquipment: [], shopLoot: [], shopPets: [] }),
        ).toBe(false);
    });

    it('keeps the shop closed on an unseeded city (D-04)', () => {
        expect(hasShopOf({})).toBe(false);
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

describe('isSeedCandidate', () => {
    const price = { gold: 0, silver: 1, copper: 0 };
    const candidate = (overrides: Record<string, unknown>) => ({
        _id: new Types.ObjectId(),
        rarity: RarityType.common,
        buyPrice: price,
        ...overrides,
    });

    it('seeds only priced items of an allowed rarity (D-08)', () => {
        expect([
            isSeedCandidate(
                candidate({ buyPrice: undefined }),
                CitySize.capital,
            ),
            isSeedCandidate(candidate({ rarity: undefined }), CitySize.capital),
            isSeedCandidate(
                candidate({ rarity: RarityType.rare }),
                CitySize.village,
            ),
            isSeedCandidate(
                candidate({ rarity: RarityType.legendary }),
                CitySize.capital,
            ),
            isSeedCandidate(
                candidate({ rarity: RarityType.rare }),
                CitySize.city,
            ),
        ]).toEqual([false, false, false, false, true]);
    });
});
