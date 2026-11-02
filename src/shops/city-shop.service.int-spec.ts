import mongoose, { Types } from 'mongoose';
import { CitySchema } from 'src/models/city.model';
import { EquipmentItemSchema } from 'src/models/equipment-item.model';
import { LootItemSchema } from 'src/models/loot-item.model';
import { PetSchema } from 'src/models/pet.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    persistCity,
    persistEquipmentItem,
    persistSpell,
} from '../../test/fixtures';
import {
    persistShopCatalogue,
    ShopWorldModels,
} from '../../test/shops/shop-world.fixture';
import { CityShopService } from './city-shop.service';

const MISSING_CITY_ID = '64b0000000000000000000ff';

const models: ShopWorldModels = {
    city: mongoose.models.City || mongoose.model('City', CitySchema),
    equipment:
        mongoose.models.EquipmentItem ||
        mongoose.model('EquipmentItem', EquipmentItemSchema),
    loot:
        mongoose.models.LootItem || mongoose.model('LootItem', LootItemSchema),
    pet: mongoose.models.Pet || mongoose.model('Pet', PetSchema),
};
const spells = mongoose.models.Spell || mongoose.model(Spell.name, SpellSchema);

describe('CityShopService', () => {
    let service: CityShopService;
    let catalogue: Awaited<ReturnType<typeof persistShopCatalogue>>;

    beforeEach(async () => {
        service = new CityShopService(
            models.city as never,
            models.equipment as never,
            models.loot as never,
            models.pet as never,
        );
        catalogue = await persistShopCatalogue(models);
    });

    function byName(items: any[], name: string): Types.ObjectId {
        return items.find((item) => item.name === name)._id;
    }

    async function persistPooledCity(
        name: string,
        type: string,
        pool: Record<string, unknown[]>,
    ) {
        const city = await persistCity(models.city, { name, type });
        await models.city.collection.updateOne({ _id: city._id }, {
            $set: pool,
        } as never);
        return city;
    }

    const namesOf = (entries: { item: { name: string } }[]) =>
        entries.map(({ item }) => item.name);

    it('serves the pool in the order stored in the database (D-18)', async () => {
        const city = await persistPooledCity('Valantar', 'valanCapital', {
            shopEquipment: [
                byName(catalogue.equipment, 'Equip rare 01'),
                byName(catalogue.equipment, 'Equip common 01'),
                byName(catalogue.equipment, 'Equip uncommon 01'),
            ],
            shopLoot: [
                byName(catalogue.loot, 'Loot common heal 01'),
                byName(catalogue.loot, 'Loot common hunger 01'),
            ],
            shopPets: [
                byName(catalogue.pets, 'Cammello del Mar Sabbioso'),
                byName(catalogue.pets, 'Cavallo leggero'),
            ],
        });

        const shop = await service.read(city._id.toHexString());

        expect({
            city: shop.city.name,
            equipment: namesOf(shop.equipment),
            loot: namesOf(shop.loot),
            pets: shop.pets.map(({ name }) => name),
        }).toEqual({
            city: 'Valantar',
            equipment: [
                'Equip rare 01',
                'Equip common 01',
                'Equip uncommon 01',
            ],
            loot: ['Loot common heal 01', 'Loot common hunger 01'],
            pets: ['Cammello del Mar Sabbioso', 'Cavallo leggero'],
        });
    });

    it('serves every entry with quantity 1 for an infinite stock (D-12)', async () => {
        const city = await persistPooledCity('Valantar', 'valanCapital', {
            shopEquipment: [
                byName(catalogue.equipment, 'Equip common 01'),
                byName(catalogue.equipment, 'Equip common 02'),
            ],
            shopLoot: [byName(catalogue.loot, 'Loot common heal 01')],
            shopPets: [],
        });

        const shop = await service.read(city._id.toHexString());

        expect(
            [...shop.equipment, ...shop.loot].map(({ itemType, quantity }) => ({
                itemType,
                quantity,
            })),
        ).toEqual([
            { itemType: 'EquipmentItem', quantity: 1 },
            { itemType: 'EquipmentItem', quantity: 1 },
            { itemType: 'LootItem', quantity: 1 },
        ]);
    });

    it('never serves a legendary, a sellable false item or a quest-only pet (D-05)', async () => {
        const city = await persistPooledCity('Valantar', 'valanCapital', {
            shopEquipment: [
                byName(catalogue.equipment, 'Equip legendary 01'),
                byName(catalogue.equipment, 'Equip vietato'),
                byName(catalogue.equipment, 'Equip common 01'),
            ],
            shopLoot: [
                byName(catalogue.loot, 'Loot legendary none 01'),
                byName(catalogue.loot, 'Loot rare none 01'),
            ],
            shopPets: [
                byName(catalogue.pets, 'Pegaso'),
                byName(catalogue.pets, 'Cavallo leggero'),
                byName(catalogue.pets, 'Grifone'),
            ],
        });

        const shop = await service.read(city._id.toHexString());

        expect({
            equipment: namesOf(shop.equipment),
            loot: namesOf(shop.loot),
            pets: shop.pets.map(({ name }) => name),
        }).toEqual({
            equipment: ['Equip common 01'],
            loot: ['Loot rare none 01'],
            pets: ['Cavallo leggero'],
        });
    });

    it('serves an ultrarare item curated by hand in a village (D-05)', async () => {
        const city = await persistPooledCity('Fineglen', 'valanVillage', {
            shopEquipment: [byName(catalogue.equipment, 'Equip ultrarare 01')],
            shopLoot: [byName(catalogue.loot, 'Loot ultrarare none 01')],
            shopPets: [],
        });

        const shop = await service.read(city._id.toHexString());

        expect([namesOf(shop.equipment), namesOf(shop.loot)]).toEqual([
            ['Equip ultrarare 01'],
            ['Loot ultrarare none 01'],
        ]);
    });

    it('skips ids missing from the catalogue (D-06)', async () => {
        const city = await persistPooledCity('Valantar', 'valanCapital', {
            shopEquipment: [
                new Types.ObjectId(),
                byName(catalogue.equipment, 'Equip common 01'),
            ],
            shopLoot: [new Types.ObjectId()],
            shopPets: [new Types.ObjectId()],
        });

        const shop = await service.read(city._id.toHexString());

        expect({
            equipment: namesOf(shop.equipment),
            loot: shop.loot,
            pets: shop.pets,
        }).toEqual({ equipment: ['Equip common 01'], loot: [], pets: [] });
    });

    it('populates the spell added by an equipment (D-18)', async () => {
        const spell = await persistSpell(spells, { name: 'Palla di fuoco' });
        const staff = await persistEquipmentItem(models.equipment, {
            name: 'Bastone del mago',
            addedSpell: spell._id,
        });
        const city = await persistPooledCity('Valantar', 'valanCapital', {
            shopEquipment: [staff._id],
            shopLoot: [],
            shopPets: [],
        });

        const shop = await service.read(city._id.toHexString());

        expect((shop.equipment[0].item as any).addedSpell?.name).toBe(
            'Palla di fuoco',
        );
    });

    it('serves empty lists for an unseeded city and for Necrorian (D-04)', async () => {
        const unseeded = await persistCity(models.city, {
            name: 'Talmvere',
            type: 'talmvereVillage',
        });
        const necrorian = await persistPooledCity(
            'Necrorian',
            'necrorianCity',
            {
                shopEquipment: [],
                shopLoot: [],
                shopPets: [],
            },
        );

        const shops = await Promise.all(
            [unseeded, necrorian].map((city) =>
                service.read(city._id.toHexString()),
            ),
        );

        expect(
            shops.map(({ city, equipment, loot, pets }) => ({
                city: city.name,
                equipment,
                loot,
                pets,
            })),
        ).toEqual([
            { city: 'Talmvere', equipment: [], loot: [], pets: [] },
            { city: 'Necrorian', equipment: [], loot: [], pets: [] },
        ]);
    });

    it('refuses an unknown city with NOT_FOUND (D-18)', async () => {
        await expect(service.read(MISSING_CITY_ID)).rejects.toMatchObject({
            extensions: { code: 'NOT_FOUND' },
        });
    });
});
