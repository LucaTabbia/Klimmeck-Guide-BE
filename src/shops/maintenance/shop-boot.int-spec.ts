import { INestApplication, Logger } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { Character } from 'src/models/character/character.model';
import { City } from 'src/models/city.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Pet } from 'src/models/pet.model';
import { createAuthTestApp } from '../../../test/auth/auth-test-app';
import {
    buildCharacter,
    persistCity,
    persistEquipmentItem,
} from '../../../test/fixtures';
import {
    persistShopCatalogue,
    persistShopCities,
    ShopWorldModels,
} from '../../../test/shops/shop-world.fixture';
import { SELLABLE_PET_IDS } from '../shop-pool.constants';
import { ShopsModule } from '../shops.module';
import { ShopBoot } from './shop-boot';
import { ShopMaintenanceModule } from './shop-maintenance.module';

describe('ShopBoot at application bootstrap (replSet)', () => {
    let moduleRef: TestingModule;
    let app: INestApplication | undefined;
    let models: ShopWorldModels;
    let characters: Model<any>;
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'shop-boot-test',
                }),
                ShopMaintenanceModule,
            ],
        }).compile();
        const model = (name: string) =>
            moduleRef.get<Model<any>>(getModelToken(name));
        models = {
            city: model(City.name),
            equipment: model(EquipmentItem.name),
            loot: model(LootItem.name),
            pet: model(Pet.name),
        };
        characters = model(Character.name);
        app = undefined;
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();
        await (app ?? moduleRef).close();
    });

    async function boot(): Promise<void> {
        app = moduleRef.createNestApplication();
        await app.init();
    }

    async function insertPetOwner(petId: Types.ObjectId) {
        const base = buildCharacter();
        const _id = new Types.ObjectId();
        await characters.collection.insertOne({
            _id,
            ...base,
            assets: { ...base.assets, pet: petId },
        });
        await characters.collection.updateOne({ _id }, {
            $unset: { 'assets.ownedPets': '' },
        } as never);
        return _id;
    }

    it('prepares pets, owned pets and pools on the first boot (D-03, D-16)', async () => {
        await persistShopCatalogue(models);
        const horseId = new Types.ObjectId(SELLABLE_PET_IDS[0]);
        await models.pet.collection.updateOne({ _id: horseId }, {
            $unset: { sellable: '' },
        } as never);
        const ownerId = await insertPetOwner(horseId);
        const cities = await persistShopCities(models.city);

        await boot();

        const horse = await models.pet.collection.findOne({ _id: horseId });
        const owner = await characters.collection.findOne({ _id: ownerId });
        const fineglen = await models.city.collection.findOne({
            _id: cities.Fineglen._id,
        });
        expect(horse?.sellable).toBe(true);
        expect(owner?.assets.ownedPets).toEqual([horseId]);
        expect(owner?.assets.pet).toEqual(horseId);
        expect(fineglen?.shopEquipment).toHaveLength(10);
        expect(fineglen?.shopLoot).toHaveLength(12);
        expect(fineglen?.shopPets).toEqual([horseId]);
    });

    it('warns at boot about a curated pool out of the rules (D-06)', async () => {
        const ultrarare = await persistEquipmentItem(models.equipment, {
            name: 'Lama ultrarara',
            rarity: 'ultrarare',
        });
        const city = await persistCity(models.city, {
            name: 'Fineglen',
            type: 'valanVillage',
        });
        await models.city.collection.updateOne({ _id: city._id }, {
            $set: {
                shopEquipment: [ultrarare._id],
                shopLoot: [],
                shopPets: [],
            },
        } as never);

        await boot();

        const warnings = warnSpy.mock.calls.map(([message]) => message);
        expect(warnings).toContain(
            `Negozio di Fineglen (${city._id.toHexString()}, village): 1 fuori taglia, 0 vietati, 0 mancanti`,
        );
    });

    it('never seeds from the shops module used by the harnesses (D-24)', async () => {
        const harness = await createAuthTestApp({ imports: [ShopsModule] });
        try {
            expect(() => harness.app.get(ShopBoot)).toThrow();
        } finally {
            await harness.close();
        }
    });
});
