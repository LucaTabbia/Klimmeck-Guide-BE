import { Types } from 'mongoose';
import { hasShopOf } from './shop-pool.rules';

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
