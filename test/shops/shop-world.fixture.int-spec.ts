import mongoose from 'mongoose';
import { CitySchema } from 'src/models/city.model';
import { EquipmentItemSchema } from 'src/models/equipment-item.model';
import { LootItemSchema } from 'src/models/loot-item.model';
import { PetSchema } from 'src/models/pet.model';
import {
    persistShopCatalogue,
    persistShopCities,
    SHOP_WORLD_CITIES,
    ShopWorldModels,
} from './shop-world.fixture';

const models: ShopWorldModels = {
    city: mongoose.models.City || mongoose.model('City', CitySchema),
    equipment:
        mongoose.models.EquipmentItem ||
        mongoose.model('EquipmentItem', EquipmentItemSchema),
    loot:
        mongoose.models.LootItem || mongoose.model('LootItem', LootItemSchema),
    pet: mongoose.models.Pet || mongoose.model('Pet', PetSchema),
};

const countBy = (items: any[], key: (item: any) => string) =>
    items.reduce<Record<string, number>>((counts, item) => {
        counts[key(item)] = (counts[key(item)] ?? 0) + 1;
        return counts;
    }, {});

describe('shop world fixture', () => {
    it('builds a catalogue with enough candidates for a capital (D-08)', async () => {
        const { equipment, loot, pets } = await persistShopCatalogue(models);

        expect(countBy(equipment, (item) => item.rarity)).toEqual({
            common: 14,
            uncommon: 10,
            rare: 6,
            ultrarare: 3,
            legendary: 2,
        });
        expect(
            equipment
                .filter(
                    (item) => item.sellable === false || item.buyPrice == null,
                )
                .map((item) => item.name)
                .sort(),
        ).toEqual(['Equip senza prezzo', 'Equip vietato']);
        expect(
            countBy(loot, (item) => `${item.rarity}:${item.effect}`),
        ).toEqual({
            'common:hunger': 3,
            'common:heal': 2,
            'common:none': 7,
            'uncommon:hunger': 1,
            'uncommon:heal': 1,
            'uncommon:none': 7,
            'rare:none': 6,
            'ultrarare:none': 3,
            'legendary:none': 1,
        });
        expect(pets.map((pet) => [pet.name, pet.sellable]).sort()).toEqual(
            [
                ['Cavallo leggero', true],
                ['Cammello del Mar Sabbioso', true],
                ['Tartaruga gigante delle isole', true],
                ['Cavallo da viaggio', true],
                ['Pegaso', false],
                ['Grifone', false],
            ].sort(),
        );
    });

    it('builds the cities of the pet placements without pool fields (D-22)', async () => {
        const cities = await persistShopCities(models.city);

        expect(Object.keys(cities).sort()).toEqual(
            SHOP_WORLD_CITIES.map(({ name }) => name).sort(),
        );
        const raw = await models.city.collection.find({}).toArray();
        expect(raw).toHaveLength(SHOP_WORLD_CITIES.length);
        for (const city of raw)
            expect(Object.keys(city).sort()).toEqual([
                '__v',
                '_id',
                'area',
                'markerLocation',
                'name',
                'pointsOfInterest',
                'relatedLore',
                'type',
            ]);
    });
});
