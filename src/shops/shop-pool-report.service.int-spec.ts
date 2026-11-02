import mongoose, { Types } from 'mongoose';
import { CitySchema } from 'src/models/city.model';
import { EquipmentItemSchema } from 'src/models/equipment-item.model';
import { LootItemSchema } from 'src/models/loot-item.model';
import { PetSchema } from 'src/models/pet.model';
import { persistCity } from '../../test/fixtures';
import {
    persistShopCatalogue,
    ShopWorldModels,
} from '../../test/shops/shop-world.fixture';
import { ShopPoolReportService } from './shop-pool-report.service';

const models: ShopWorldModels = {
    city: mongoose.models.City || mongoose.model('City', CitySchema),
    equipment:
        mongoose.models.EquipmentItem ||
        mongoose.model('EquipmentItem', EquipmentItemSchema),
    loot:
        mongoose.models.LootItem || mongoose.model('LootItem', LootItemSchema),
    pet: mongoose.models.Pet || mongoose.model('Pet', PetSchema),
};

describe('ShopPoolReportService', () => {
    let service: ShopPoolReportService;
    let catalogue: Awaited<ReturnType<typeof persistShopCatalogue>>;

    beforeEach(async () => {
        service = new ShopPoolReportService(
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

    async function seedWorld() {
        const common = byName(catalogue.equipment, 'Equip common 01');
        const ultrarare = byName(catalogue.equipment, 'Equip ultrarare 01');
        await persistPooledCity('Valantar', 'valanCapital', {
            shopEquipment: [common],
            shopLoot: [],
            shopPets: [],
        });
        await persistPooledCity('Shadmus', 'desertVillage', {
            shopEquipment: [ultrarare],
            shopLoot: [],
            shopPets: [],
        });
        await persistPooledCity('Fineglen', 'valanVillage', {
            shopEquipment: [],
            shopLoot: [],
            shopPets: [],
        });
        await persistPooledCity('Necrorian', 'necrorianCity', {
            shopEquipment: [],
            shopLoot: [],
            shopPets: [],
        });
        await persistCity(models.city, {
            name: 'Talmvere',
            type: 'talmvereVillage',
        });
        await persistPooledCity('Porto Saldo', 'drusteaSeaCity', {
            shopEquipment: [common],
        });
    }

    async function snapshot() {
        const read = (model: any) => model.collection.find({}).toArray();
        return Promise.all([
            read(models.city),
            read(models.equipment),
            read(models.loot),
            read(models.pet),
        ]);
    }

    it('lists only the seeded cities with violations sorted by name (D-06)', async () => {
        await seedWorld();

        const { entries } = await service.report();

        expect(
            entries.map(({ cityName, emptyPool, outOfSize }) => ({
                cityName,
                emptyPool,
                outOfSize: outOfSize.map(({ name }) => name),
            })),
        ).toEqual([
            { cityName: 'Fineglen', emptyPool: true, outOfSize: [] },
            {
                cityName: 'Shadmus',
                emptyPool: false,
                outOfSize: ['Equip ultrarare 01'],
            },
        ]);
    });

    it('counts the cities not yet seeded without reporting them (D-06)', async () => {
        await seedWorld();

        const { entries, unseeded } = await service.report();

        expect(unseeded).toBe(2);
        expect(entries.map(({ cityName }) => cityName)).not.toContain(
            'Talmvere',
        );
        expect(entries.map(({ cityName }) => cityName)).not.toContain(
            'Porto Saldo',
        );
    });

    it('never writes to the database (D-06)', async () => {
        await seedWorld();
        const before = await snapshot();

        await service.report();

        expect(await snapshot()).toEqual(before);
    });
});
