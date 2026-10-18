import { INestApplication } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { EconomyModule } from 'src/economy/economy.module';
import { CatalogPricesReader } from 'src/economy/trade/catalog-prices.reader';
import { priceKey, type TradeLine } from 'src/economy/trade/trade-line';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { persistEquipmentItem, persistLootItem } from '../../../test/fixtures';

describe('CatalogPricesReader (replSet)', () => {
    let app: INestApplication;
    let reader: CatalogPricesReader;
    let connection: Connection;
    let equipment: Model<EquipmentItemDocument>;
    let loot: Model<LootItemDocument>;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'economy-catalog-test',
                }),
                EconomyModule,
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        reader = app.get(CatalogPricesReader);
        connection = app.get<Connection>(getConnectionToken());
        equipment = app.get<Model<EquipmentItemDocument>>(
            getModelToken(EquipmentItem.name),
        );
        loot = app.get<Model<LootItemDocument>>(getModelToken(LootItem.name));
        await Promise.all([equipment.init(), loot.init()]);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all([equipment.deleteMany({}), loot.deleteMany({})]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    function line(
        direction: TradeLine['direction'],
        kind: TradeLine['kind'],
        itemId: Types.ObjectId,
    ): TradeLine {
        return { direction, kind, itemId, quantity: 1 };
    }

    it('reads equipment and loot prices keyed by kind and id', async () => {
        const sword = await persistEquipmentItem(equipment);
        const potion = await persistLootItem(loot);

        const prices = await reader.read([
            line('buy', 'EquipmentItem', sword._id as Types.ObjectId),
            line('sell', 'LootItem', potion._id as Types.ObjectId),
        ]);

        expect(
            prices.get(priceKey('EquipmentItem', sword._id as Types.ObjectId)),
        ).toMatchObject({
            buyPrice: { gold: 0, silver: 1, copper: 50 },
            sellPrice: { gold: 0, silver: 0, copper: 75 },
        });
        expect(
            prices.get(priceKey('LootItem', potion._id as Types.ObjectId)),
        ).toMatchObject({
            buyPrice: { gold: 0, silver: 0, copper: 20 },
            sellPrice: { gold: 0, silver: 0, copper: 10 },
        });
    });

    it('does not find an equipment id asked as loot', async () => {
        const sword = await persistEquipmentItem(equipment);
        const swordId = sword._id as Types.ObjectId;

        const prices = await reader.read([line('buy', 'LootItem', swordId)]);

        expect(prices.has(priceKey('LootItem', swordId))).toBe(false);
    });

    it('keeps null prices as null', async () => {
        const relic = await persistLootItem(loot, {
            name: 'Reliquia',
            buyPrice: null,
            sellPrice: null,
        });
        const relicId = relic._id as Types.ObjectId;

        const prices = await reader.read([line('buy', 'LootItem', relicId)]);

        expect(prices.get(priceKey('LootItem', relicId))?.buyPrice).toBeNull();
        expect(prices.get(priceKey('LootItem', relicId))?.sellPrice).toBeNull();
    });

    it('skips the database when there are no lines', async () => {
        const findSpy = jest.spyOn(equipment, 'find');

        const prices = await reader.read([]);

        expect(prices.size).toBe(0);
        expect(findSpy).not.toHaveBeenCalled();
    });
});
