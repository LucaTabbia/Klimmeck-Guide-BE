import { citySizeOf } from 'src/cities/city-size';
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { isObjectIdHex } from 'src/mongo/document-id';
import {
    NO_SHOP_CITY_TYPES,
    SELLABLE_PET_IDS,
    SELLABLE_PET_PLACEMENTS,
    SHOP_LOOT_GUARANTEES,
    SHOP_POOL_SIZES,
    SHOP_RARITY_WEIGHTS,
} from './shop-pool.constants';

const SIZES = [CitySize.village, CitySize.city, CitySize.capital] as const;

describe('shop seeding constants', () => {
    it('sizes the pools by city size (D-08)', () => {
        expect(SHOP_POOL_SIZES).toEqual({
            village: { equipment: 10, loot: 12 },
            city: { equipment: 16, loot: 18 },
            capital: { equipment: 24, loot: 24 },
        });
    });

    it('weighs every size to 100 percent from the most common tier (D-08)', () => {
        for (const size of SIZES) {
            const total = SHOP_RARITY_WEIGHTS[size].reduce(
                (sum, { percent }) => sum + percent,
                0,
            );
            expect(total).toBe(100);
        }
        expect(SHOP_RARITY_WEIGHTS).toEqual({
            village: [
                { rarity: RarityType.common, percent: 75 },
                { rarity: RarityType.uncommon, percent: 25 },
            ],
            city: [
                { rarity: RarityType.common, percent: 50 },
                { rarity: RarityType.uncommon, percent: 35 },
                { rarity: RarityType.rare, percent: 15 },
            ],
            capital: [
                { rarity: RarityType.common, percent: 35 },
                { rarity: RarityType.uncommon, percent: 35 },
                { rarity: RarityType.rare, percent: 20 },
                { rarity: RarityType.ultrarare, percent: 10 },
            ],
        });
    });

    it('never weighs the legendary tier (D-05, D-08)', () => {
        const rarities = SIZES.flatMap((size) =>
            SHOP_RARITY_WEIGHTS[size].map(({ rarity }) => rarity),
        );
        expect(rarities).not.toContain(RarityType.legendary);
    });

    it('guarantees two hunger and one heal loot (D-09)', () => {
        expect(SHOP_LOOT_GUARANTEES).toEqual([
            { effect: EffectType.hunger, count: 2 },
            { effect: EffectType.heal, count: 1 },
        ]);
    });

    it('sells four pets in two cities each, one of them a capital (D-10)', () => {
        expect(SELLABLE_PET_PLACEMENTS).toHaveLength(4);
        for (const { cities } of SELLABLE_PET_PLACEMENTS) {
            expect(cities).toHaveLength(2);
            const capitals = cities.filter(
                ({ type }) => citySizeOf(type) === CitySize.capital,
            );
            expect(capitals).toHaveLength(1);
        }
    });

    it('pins the pet ids as ObjectId hex (D-10)', () => {
        for (const { petId } of SELLABLE_PET_PLACEMENTS) {
            expect(isObjectIdHex(petId)).toBe(true);
        }
        expect(SELLABLE_PET_IDS).toEqual(
            SELLABLE_PET_PLACEMENTS.map(({ petId }) => petId),
        );
        expect(new Set(SELLABLE_PET_IDS).size).toBe(4);
    });

    it('keeps Necrorian without a shop (D-04)', () => {
        expect(NO_SHOP_CITY_TYPES).toEqual([CityType.necrorianCity]);
    });
});
