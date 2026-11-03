import { INestApplication, Logger } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import { City } from 'src/models/city.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { createAuthTestApp } from '../../../test/auth/auth-test-app';
import { persistCity, persistEquipmentItem } from '../../../test/fixtures';
import { ShopsModule } from '../shops.module';
import { ShopBoot } from './shop-boot';
import { ShopMaintenanceModule } from './shop-maintenance.module';

describe('ShopBoot at application bootstrap (replSet)', () => {
    let moduleRef: TestingModule;
    let app: INestApplication | undefined;
    let cities: Model<any>;
    let equipment: Model<any>;
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
        cities = moduleRef.get<Model<any>>(getModelToken(City.name));
        equipment = moduleRef.get<Model<any>>(
            getModelToken(EquipmentItem.name),
        );
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

    function warnings(): unknown[] {
        return warnSpy.mock.calls.map(([message]) => message);
    }

    it('writes nothing at boot and only counts a city without a pool (D-25)', async () => {
        const city = await persistCity(cities, {
            name: 'Fineglen',
            type: 'valanVillage',
        });
        const before = await cities.collection.findOne({ _id: city._id });

        await boot();

        expect(await cities.collection.findOne({ _id: city._id })).toEqual(
            before,
        );
        expect(warnings()).toEqual([
            'Negozi: 0 città con pool fuori regola, 1 non seminate',
        ]);
    });

    it('warns at boot about a curated pool out of the rules (D-06)', async () => {
        const ultrarare = await persistEquipmentItem(equipment, {
            name: 'Lama ultrarara',
            rarity: 'ultrarare',
        });
        const city = await persistCity(cities, {
            name: 'Fineglen',
            type: 'valanVillage',
        });
        await cities.collection.updateOne({ _id: city._id }, {
            $set: {
                shopEquipment: [ultrarare._id],
                shopLoot: [],
                shopPets: [],
            },
        } as never);

        await boot();

        expect(warnings()).toContain(
            `Negozio di Fineglen (${city._id.toHexString()}, village): 1 fuori taglia, 0 vietati, 0 mancanti`,
        );
    });

    it('never runs the boot report from the shops module used by the harnesses (D-24)', async () => {
        const harness = await createAuthTestApp({ imports: [ShopsModule] });
        try {
            expect(() => harness.app.get(ShopBoot)).toThrow();
        } finally {
            await harness.close();
        }
    });
});
