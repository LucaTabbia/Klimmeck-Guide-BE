import { CityType } from 'src/models/enums/city-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    NO_SHOP_CITY_TYPES,
    SHOP_ALLOWED_RARITIES,
} from './shop-pool.constants';

describe('shop constants', () => {
    it('allows the rarities by city size from the most common tier (D-08)', () => {
        expect(SHOP_ALLOWED_RARITIES).toEqual({
            village: [RarityType.common, RarityType.uncommon],
            city: [RarityType.common, RarityType.uncommon, RarityType.rare],
            capital: [
                RarityType.common,
                RarityType.uncommon,
                RarityType.rare,
                RarityType.ultrarare,
            ],
        });
    });

    it('never allows the legendary tier (D-05, D-08)', () => {
        expect(Object.values(SHOP_ALLOWED_RARITIES).flat()).not.toContain(
            RarityType.legendary,
        );
    });

    it('keeps Necrorian without a shop (D-04)', () => {
        expect(NO_SHOP_CITY_TYPES).toEqual([CityType.necrorianCity]);
    });
});
