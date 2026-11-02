import { Logger } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';
import { citySizeOf } from 'src/cities/city-size';
import { CitySchema } from 'src/models/city.model';
import { CityType } from 'src/models/enums/city-type.enum';
import { EquipmentItemSchema } from 'src/models/equipment-item.model';
import { LootItemSchema } from 'src/models/loot-item.model';
import { PetSchema } from 'src/models/pet.model';
import { persistCity } from '../../../test/fixtures';
import {
    persistShopCatalogue,
    persistShopCities,
    SHOP_WORLD_CITIES,
    ShopWorldModels,
} from '../../../test/shops/shop-world.fixture';
import { SHOP_REPORT_WARNINGS_LIMIT } from '../shop-pool.constants';
import { allowedRaritiesOf } from '../shop-pool.rules';
import { ShopPoolSeeder } from './shop-pool.seeder';

const models: ShopWorldModels = {
    city: mongoose.models.City || mongoose.model('City', CitySchema),
    equipment:
        mongoose.models.EquipmentItem ||
        mongoose.model('EquipmentItem', EquipmentItemSchema),
    loot:
        mongoose.models.LootItem || mongoose.model('LootItem', LootItemSchema),
    pet: mongoose.models.Pet || mongoose.model('Pet', PetSchema),
};

interface RawCity {
    _id: Types.ObjectId;
    name: string;
    type: CityType;
    shopEquipment?: Types.ObjectId[];
    shopLoot?: Types.ObjectId[];
    shopPets?: Types.ObjectId[];
}

interface CatalogueEntry {
    name: string;
    rarity?: string;
    effect?: string;
}

const POOL_FIELDS = ['shopEquipment', 'shopLoot', 'shopPets'] as const;

describe('ShopPoolSeeder', () => {
    let seeder: ShopPoolSeeder;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let catalogue: Map<string, CatalogueEntry>;

    beforeEach(() => {
        seeder = new ShopPoolSeeder(
            models.city as never,
            models.equipment as never,
            models.loot as never,
            models.pet as never,
        );
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        catalogue = new Map();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function buildWorld(): Promise<void> {
        const { equipment, loot, pets } = await persistShopCatalogue(models);
        for (const item of [...equipment, ...loot, ...pets])
            catalogue.set((item._id as Types.ObjectId).toHexString(), item);
        await persistShopCities(models.city);
    }

    async function rawCities(): Promise<RawCity[]> {
        return (await models.city.collection
            .find({})
            .sort({ _id: 1 })
            .toArray()) as unknown as RawCity[];
    }

    async function rawCity(name: string): Promise<RawCity> {
        return (await models.city.collection.findOne({
            name,
        })) as unknown as RawCity;
    }

    const entriesOf = (ids: Types.ObjectId[] = []) =>
        ids.map((id) => catalogue.get(id.toHexString()) as CatalogueEntry);

    const namesOf = (ids: Types.ObjectId[] = []) =>
        entriesOf(ids).map(({ name }) => name);

    const messagesOf = (spy: jest.SpyInstance): string[] =>
        spy.mock.calls.map(([message]) => String(message));

    const placementWarnings = () =>
        messagesOf(warnSpy).filter((message) =>
            message.startsWith('Piazzamento'),
        );

    it('seeds every absent pool list with the quota of the city size (D-03, D-08)', async () => {
        await buildWorld();

        await seeder.seedAll();

        const sizes = await Promise.all(
            ['Fineglen', 'Porto Saldo', 'Valantar'].map(async (name) => {
                const city = await rawCity(name);
                return [city.shopEquipment?.length, city.shopLoot?.length];
            }),
        );
        expect(sizes).toEqual([
            [10, 12],
            [16, 18],
            [24, 24],
        ]);
    });

    it('puts two hunger and one heal loot in every seeded pool (D-09)', async () => {
        await buildWorld();

        await seeder.seedAll();

        const shops = (await rawCities()).filter(
            ({ type }) => type !== CityType.necrorianCity,
        );
        expect(shops).toHaveLength(SHOP_WORLD_CITIES.length - 1);
        for (const city of shops) {
            const effects = entriesOf(city.shopLoot).map(
                ({ effect }) => effect,
            );
            expect(
                effects.filter((effect) => effect === 'hunger').length,
            ).toBeGreaterThanOrEqual(2);
            expect(
                effects.filter((effect) => effect === 'heal').length,
            ).toBeGreaterThanOrEqual(1);
        }
    });

    it('seeds only the rarities allowed by the city size (D-08)', async () => {
        await buildWorld();

        await seeder.seedAll();

        for (const city of await rawCities()) {
            const allowed: string[] = allowedRaritiesOf(citySizeOf(city.type));
            const rarities = entriesOf([
                ...(city.shopEquipment ?? []),
                ...(city.shopLoot ?? []),
            ]).map(({ rarity }) => rarity);
            expect(
                rarities.filter((rarity) => !allowed.includes(String(rarity))),
            ).toEqual([]);
        }
    });

    it('never seeds a legendary, a sellable false or a priceless item (D-05)', async () => {
        await buildWorld();

        await seeder.seedAll();

        const seeded = (await rawCities()).flatMap((city) =>
            entriesOf([
                ...(city.shopEquipment ?? []),
                ...(city.shopLoot ?? []),
            ]),
        );
        expect(seeded.length).toBeGreaterThan(0);
        expect(
            seeded
                .filter(
                    ({ name, rarity }) =>
                        rarity === 'legendary' ||
                        name === 'Equip vietato' ||
                        name === 'Equip senza prezzo',
                )
                .map(({ name }) => name),
        ).toEqual([]);
    });

    it('places the four sellable pets in their two cities only (D-10)', async () => {
        await buildWorld();

        await seeder.seedAll();

        const petsByCity = Object.fromEntries(
            (await rawCities()).map((city) => [
                city.name,
                namesOf(city.shopPets),
            ]),
        );
        expect(petsByCity).toEqual({
            Fineglen: ['Cavallo leggero'],
            Valantar: ['Cavallo leggero', 'Cammello del Mar Sabbioso'],
            Shadmus: ['Cammello del Mar Sabbioso'],
            'Croce Marina': ['Tartaruga gigante delle isole'],
            Bellport: ['Tartaruga gigante delle isole'],
            Talmvere: ['Cavallo da viaggio'],
            Cliffbreak: ['Cavallo da viaggio'],
            Necrorian: [],
            'Porto Saldo': [],
        });
    });

    it('gives Necrorian an explicit empty pool (D-04)', async () => {
        await buildWorld();

        await seeder.seedAll();

        const necrorian = await rawCity('Necrorian');
        expect(POOL_FIELDS.map((field) => necrorian[field])).toEqual([
            [],
            [],
            [],
        ]);
    });

    it('never touches a pool list already present even when empty (D-03, D-22)', async () => {
        await buildWorld();
        await models.city.collection.updateOne(
            { name: 'Talmvere' },
            { $set: { shopLoot: [], shopPets: [] } },
        );

        await seeder.seedAll();

        const talmvere = await rawCity('Talmvere');
        expect(talmvere.shopEquipment).toHaveLength(10);
        expect(talmvere.shopLoot).toEqual([]);
        expect(talmvere.shopPets).toEqual([]);
    });

    it('is idempotent (D-03)', async () => {
        await buildWorld();
        await seeder.seedAll();
        const firstRun = await rawCities();

        const report = await seeder.seedAll();

        expect(report).toEqual({ equipment: 0, loot: 0, pets: 0, deferred: 0 });
        expect(await rawCities()).toEqual(firstRun);
    });

    it('reseeds a deleted list with the same items (D-21, D-24)', async () => {
        await buildWorld();
        await seeder.seedAll();
        const seeded = (await rawCity('Fineglen')).shopEquipment;
        await models.city.collection.updateOne(
            { name: 'Fineglen' },
            { $unset: { shopEquipment: '' } },
        );

        const report = await seeder.seedAll();

        expect(report).toEqual({ equipment: 1, loot: 0, pets: 0, deferred: 0 });
        expect((await rawCity('Fineglen')).shopEquipment).toEqual(seeded);
    });

    it('defers the equipment and loot lists while the catalogue has no candidates (D-22)', async () => {
        await persistShopCities(models.city);

        const report = await seeder.seedAll();

        expect(report).toEqual({
            equipment: 1,
            loot: 1,
            pets: 1,
            deferred: (SHOP_WORLD_CITIES.length - 1) * POOL_FIELDS.length,
        });
        for (const city of await rawCities()) {
            if (city.type === CityType.necrorianCity) continue;
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
        }
        expect(
            messagesOf(warnSpy).filter((message) =>
                message.includes('rinviate'),
            ),
        ).toEqual([
            'Negozi: 24 liste rinviate al prossimo boot, catalogo senza candidati',
        ]);
    });

    it('warns when a placement city is missing (D-10)', async () => {
        await buildWorld();
        await models.city.collection.deleteOne({ name: 'Shadmus' });

        await seeder.seedAll();

        expect(placementWarnings()).toEqual([
            'Piazzamento del compagno Cammello del Mar Sabbioso: città Shadmus (desertVillage) trovata 0 volte',
        ]);
    });

    it('stays silent about the placements on a restart (D-10)', async () => {
        await buildWorld();
        await models.city.collection.deleteOne({ name: 'Shadmus' });
        await seeder.seedAll();
        warnSpy.mockClear();

        await seeder.seedAll();

        expect(placementWarnings()).toEqual([]);
    });

    it('warns about the pools without the guaranteed food and cure (D-09)', async () => {
        await buildWorld();
        await models.loot.collection.deleteMany({ effect: 'hunger' });

        await seeder.seedAll();

        const guaranteeWarnings = messagesOf(warnSpy).filter((message) =>
            message.includes('garanzie'),
        );
        expect(guaranteeWarnings).toHaveLength(SHOP_WORLD_CITIES.length - 1);
        expect(guaranteeWarnings).toContain(
            'Negozi: Fineglen (valanVillage) senza le garanzie di loot hunger, hunger',
        );
    });

    it('caps the guarantee warnings of a run (D-24)', async () => {
        await buildWorld();
        await models.loot.collection.deleteMany({ effect: 'hunger' });
        for (let index = 0; index < SHOP_REPORT_WARNINGS_LIMIT; index++)
            await persistCity(models.city, {
                name: `Borgo ${index}`,
                type: CityType.valanVillage,
            });

        await seeder.seedAll();

        const guaranteeWarnings = messagesOf(warnSpy).filter((message) =>
            message.includes('garanzie'),
        );
        expect(guaranteeWarnings).toHaveLength(SHOP_REPORT_WARNINGS_LIMIT + 1);
        expect(guaranteeWarnings[SHOP_REPORT_WARNINGS_LIMIT]).toBe(
            'Negozi: altre 8 liste di loot senza le garanzie non elencate',
        );
    });

    it('reports separate counts per list (D-03)', async () => {
        await buildWorld();

        const report = await seeder.seedAll();

        expect(report).toEqual({ equipment: 9, loot: 9, pets: 9, deferred: 0 });
        expect(messagesOf(logSpy)).toEqual([
            'Negozi: seminate 9 liste di equipaggiamenti, 9 di loot, 9 di compagni',
        ]);
    });

    it('counts only the lists it writes (D-03)', async () => {
        await buildWorld();
        await models.city.collection.updateOne(
            { name: 'Talmvere' },
            { $set: { shopLoot: [] } },
        );

        const report = await seeder.seedAll();

        expect(report).toEqual({ equipment: 9, loot: 8, pets: 9, deferred: 0 });
    });

    it('logs ids, names and counts only (D-24)', async () => {
        await buildWorld();
        await models.city.collection.deleteOne({ name: 'Shadmus' });
        await models.loot.collection.deleteMany({ effect: 'hunger' });

        await seeder.seedAll();

        const messages = [...messagesOf(logSpy), ...messagesOf(warnSpy)];
        expect(messages.length).toBeGreaterThan(0);
        expect(
            messages.filter((message) =>
                message.toLowerCase().includes('mongodb'),
            ),
        ).toEqual([]);
    });
});
