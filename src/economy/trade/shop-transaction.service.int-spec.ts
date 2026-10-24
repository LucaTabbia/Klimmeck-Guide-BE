import { INestApplication } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import { EconomyModule } from 'src/economy/economy.module';
import { ShopTransactionService } from 'src/economy/trade/shop-transaction.service';
import { WalletService } from 'src/economy/wallet.service';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import type { AssetQuantityInput } from 'src/models/common/asset-quantity.model';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';
import { User, UserDocument } from 'src/models/user.model';
import { cityModelOf, placeInCity } from '../../../test/economy/place-in-city';
import {
    buildCharacter,
    persistCharacter,
    persistCity,
    persistEquipmentItem,
    persistLootItem,
} from '../../../test/fixtures';
import { buildActiveTravelDoc } from '../../../test/travel/active-travel.fixture';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const SUCCESS = {
    response: 'Transazione avvenuta con successo',
    successful: true,
};

interface CatalogDocument {
    _id: unknown;
}

interface TradeInput {
    id: Types.ObjectId | string;
    buyEquip?: AssetQuantityInput[];
    buyLoot?: AssetQuantityInput[];
    sellEquip?: AssetQuantityInput[];
    sellLoot?: AssetQuantityInput[];
    total: CoinPurse;
    isTotalPositive: boolean;
}

interface OwnedEntry {
    itemType: 'EquipmentItem' | 'LootItem';
    item: Types.ObjectId;
    quantity: number;
}

const coins = (gold: number, silver: number, copper: number): CoinPurse => ({
    gold,
    silver,
    copper,
});

const idOf = (document: CatalogDocument) => document._id as Types.ObjectId;

const asset = (
    document: CatalogDocument,
    quantity = 1,
): AssetQuantityInput => ({ item: idOf(document).toHexString(), quantity });

function trade({
    id,
    buyEquip = [],
    buyLoot = [],
    sellEquip = [],
    sellLoot = [],
    total,
    isTotalPositive,
}: TradeInput): TransactionRequest {
    return {
        id: id.toString(),
        boughtItems: { equipAssets: buyEquip, lootAssets: buyLoot },
        soldItems: { equipAssets: sellEquip, lootAssets: sellLoot },
        total,
        isTotalPositive,
    };
}

function codesOf(results: PromiseSettledResult<unknown>[]): unknown[] {
    return results
        .filter((result) => result.status === 'rejected')
        .map((result) => (result.reason as { code?: unknown }).code);
}

describe('ShopTransactionService (replSet)', () => {
    let app: INestApplication;
    let shop: ShopTransactionService;
    let wallet: WalletService;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let equipment: Model<EquipmentItemDocument>;
    let loot: Model<LootItemDocument>;
    let sword: CatalogDocument;
    let potion: CatalogDocument;
    let relic: CatalogDocument;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'economy-shop-test',
                }),
                EconomyModule,
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        shop = app.get(ShopTransactionService);
        wallet = app.get(WalletService);
        connection = app.get<Connection>(getConnectionToken());
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        users = app.get<Model<UserDocument>>(getModelToken(User.name));
        equipment = app.get<Model<EquipmentItemDocument>>(
            getModelToken(EquipmentItem.name),
        );
        loot = app.get<Model<LootItemDocument>>(getModelToken(LootItem.name));
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([
            characters.init(),
            users.init(),
            equipment.init(),
            loot.init(),
        ]);
    });

    beforeEach(async () => {
        sword = await persistEquipmentItem(equipment); // buy 150, sell 75
        potion = await persistLootItem(loot); // buy 20, sell 10
        relic = await persistLootItem(loot, {
            name: 'Reliquia',
            buyPrice: null,
            sellPrice: null,
        });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all([
            characters.deleteMany({}),
            users.deleteMany({}),
            equipment.deleteMany({}),
            loot.deleteMany({}),
            cityModelOf({ connection }).deleteMany({}),
        ]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    const owned = (
        itemType: OwnedEntry['itemType'],
        document: CatalogDocument,
        quantity: number,
    ): OwnedEntry => ({ itemType, item: idOf(document), quantity });

    interface TraderInventory {
        ownedEquipments?: OwnedEntry[];
        ownedItems?: OwnedEntry[];
        wearedEquipment?: Record<string, Types.ObjectId | null>;
    }

    function persistCharacterOutsideCity(
        purse: CoinPurse,
        inventory: TraderInventory = {},
        overrides: Record<string, unknown> = {},
        status: Record<string, unknown> = {},
    ): Promise<CharacterDocument> {
        const base = buildCharacter();
        return persistCharacter(characters, {
            status: { ...base.status, coins: purse, ...status },
            assets: { ...base.assets, ...inventory },
            ...overrides,
        }) as Promise<CharacterDocument>;
    }

    async function persistTraderOutsideCity(
        purse: CoinPurse,
        status: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const character = await persistCharacterOutsideCity(
            purse,
            {},
            {},
            status,
        );
        return character._id as Types.ObjectId;
    }

    // il negozio risponde solo in città (D-18): il trader sta sul marker di una città
    async function persistTrader(
        purse: CoinPurse,
        inventory: TraderInventory = {},
        overrides: Record<string, unknown> = {},
        status: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const character = await persistCharacterOutsideCity(
            purse,
            inventory,
            overrides,
            status,
        );
        await placeInCity({ connection }, character);
        return character._id as Types.ObjectId;
    }

    function raw(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    describe('successful trades', () => {
        it('buys at catalog prices, normalizes the purse and stores ObjectId entries', async () => {
            const id = await persistTrader(coins(0, 5, 0));

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        buyLoot: [asset(potion, 2)],
                        total: coins(0, 1, 90),
                        isTotalPositive: false,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 3, 10));
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', sword, 1),
            ]);
            expect(after?.assets.ownedItems).toEqual([
                owned('LootItem', potion, 2),
            ]);
            await expect(
                characters.collection.countDocuments({
                    _id: id,
                    'assets.ownedEquipments.item': { $type: 'objectId' },
                    'assets.ownedItems.item': { $type: 'objectId' },
                }),
            ).resolves.toBe(1);
        });

        it('accepts a non-normalized client total', async () => {
            const id = await persistTrader(coins(0, 5, 0));

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        buyLoot: [asset(potion, 2)],
                        total: coins(0, 0, 190),
                        isTotalPositive: false,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);
        });

        it('increments an existing entry on a repeat buy', async () => {
            const id = await persistTrader(coins(0, 1, 0), {
                ownedItems: [owned('LootItem', potion, 1)],
            });

            await shop.execute(
                trade({
                    id,
                    buyLoot: [asset(potion, 2)],
                    total: coins(0, 0, 40),
                    isTotalPositive: false,
                }),
            );

            const after = await raw(id);
            expect(after?.assets.ownedItems).toEqual([
                owned('LootItem', potion, 3),
            ]);
            expect(after?.status.coins).toEqual(coins(0, 0, 60));
        });

        it('sells owned items, removing entries that reach zero', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [owned('EquipmentItem', sword, 1)],
                ownedItems: [owned('LootItem', potion, 3)],
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(sword)],
                        sellLoot: [asset(potion)],
                        total: coins(0, 0, 85),
                        isTotalPositive: true,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 85));
            expect(after?.assets.ownedEquipments).toEqual([]);
            expect(after?.assets.ownedItems).toEqual([
                owned('LootItem', potion, 2),
            ]);
        });

        it('unequips a worn equipment when its last copy is sold', async () => {
            const helmet = await persistEquipmentItem(equipment, {
                name: 'Elmo',
            });
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [
                    owned('EquipmentItem', sword, 1),
                    owned('EquipmentItem', helmet, 1),
                ],
                wearedEquipment: {
                    rightHand: idOf(sword),
                    head: idOf(helmet),
                },
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(sword)],
                        total: coins(0, 0, 75),
                        isTotalPositive: true,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', helmet, 1),
            ]);
            expect(after?.assets.wearedEquipment.rightHand).toBeNull();
            expect(after?.assets.wearedEquipment.head).toEqual(idOf(helmet));
        });

        it('keeps a worn equipment equipped while a copy remains', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [owned('EquipmentItem', sword, 2)],
                wearedEquipment: { rightHand: idOf(sword) },
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(sword)],
                        total: coins(0, 0, 75),
                        isTotalPositive: true,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', sword, 1),
            ]);
            expect(after?.assets.wearedEquipment.rightHand).toEqual(
                idOf(sword),
            );
        });

        it('sells a legacy entry whose item id was stored as a string', async () => {
            const id = await persistTrader(coins(0, 0, 0));
            const legacyPotion = idOf(potion).toHexString();
            await characters.collection.updateOne(
                { _id: id },
                {
                    $set: {
                        'assets.ownedItems': [
                            {
                                itemType: 'LootItem',
                                item: legacyPotion,
                                quantity: 2,
                            },
                        ],
                    },
                },
            );

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellLoot: [asset(potion)],
                        total: coins(0, 0, 10),
                        isTotalPositive: true,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 10));
            expect(after?.assets.ownedItems).toEqual([
                { itemType: 'LootItem', item: legacyPotion, quantity: 1 },
            ]);
        });

        it('nets buys against sells', async () => {
            const id = await persistTrader(coins(0, 1, 20), {
                ownedItems: [owned('LootItem', potion, 3)],
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        sellLoot: [asset(potion, 3)],
                        total: coins(0, 1, 20),
                        isTotalPositive: false,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 0));
            expect(after?.assets.ownedItems).toEqual([]);
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', sword, 1),
            ]);
        });

        it('answers an empty zero-total trade as a no-op without opening a transaction', async () => {
            const id = await persistTrader(coins(0, 1, 0));
            const before = await raw(id);
            const transaction = jest.spyOn(connection, 'transaction');

            await expect(
                shop.execute(
                    trade({
                        id,
                        total: coins(0, 0, 0),
                        isTotalPositive: false,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            expect(transaction).not.toHaveBeenCalled();
            expect(await raw(id)).toEqual(before);
        });
    });

    describe('rejections', () => {
        it('rejects a total that differs from the catalog with TRANSACTION_TOTAL_MISMATCH and writes nothing', async () => {
            const id = await persistTrader(coins(0, 5, 0));
            const before = await raw(id);

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        total: coins(0, 0, 1),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'TRANSACTION_TOTAL_MISMATCH' });
            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: true,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'TRANSACTION_TOTAL_MISMATCH' });

            expect(await raw(id)).toEqual(before);
        });

        it('rejects unknown items with ITEM_NOT_FOUND', async () => {
            const id = await persistTrader(coins(1, 0, 0));
            const unknownRequests = [
                { item: new Types.ObjectId().toHexString(), quantity: 1 },
                { item: 'abc', quantity: 1 },
                { item: null, quantity: 1 },
            ];

            for (const unknown of unknownRequests) {
                await expect(
                    shop.execute(
                        trade({
                            id,
                            buyEquip: [unknown],
                            total: coins(0, 1, 50),
                            isTotalPositive: false,
                        }),
                    ),
                ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
            }
            await expect(
                shop.execute(
                    trade({
                        id,
                        buyLoot: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
        });

        it('rejects a null price with ITEM_NOT_TRADABLE', async () => {
            const id = await persistTrader(coins(1, 0, 0), {
                ownedItems: [owned('LootItem', relic, 1)],
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyLoot: [asset(relic)],
                        total: coins(0, 0, 0),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'ITEM_NOT_TRADABLE' });
            await expect(
                shop.execute(
                    trade({
                        id,
                        sellLoot: [asset(relic)],
                        total: coins(0, 0, 0),
                        isTotalPositive: true,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'ITEM_NOT_TRADABLE' });
        });

        it('rejects invalid quantities with INVALID_QUANTITY', async () => {
            const id = await persistTrader(coins(1, 0, 0));
            const invalidTrades = [
                { buyEquip: [asset(sword, 0)] },
                { buyEquip: [asset(sword, -1)] },
                { buyEquip: [asset(sword), asset(sword)] },
                { buyLoot: [asset(potion)], sellLoot: [asset(potion)] },
            ];

            for (const lists of invalidTrades) {
                await expect(
                    shop.execute(
                        trade({
                            id,
                            ...lists,
                            total: coins(0, 0, 0),
                            isTotalPositive: false,
                        }),
                    ),
                ).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
            }
        });

        it('rejects selling what is not owned', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedItems: [owned('LootItem', potion, 1)],
            });
            const before = await raw(id);

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(sword)],
                        total: coins(0, 0, 75),
                        isTotalPositive: true,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });
            await expect(
                shop.execute(
                    trade({
                        id,
                        sellLoot: [asset(potion, 2)],
                        total: coins(0, 0, 20),
                        isTotalPositive: true,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_ITEM_QUANTITY' });

            expect(await raw(id)).toEqual(before);
        });

        it('rejects an unaffordable buy with INSUFFICIENT_FUNDS and writes nothing', async () => {
            const id = await persistTrader(coins(0, 1, 0));
            const before = await raw(id);

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

            expect(await raw(id)).toEqual(before);
        });

        it('answers NOT_FOUND for a missing or archived character', async () => {
            await expect(
                shop.execute(
                    trade({
                        id: new Types.ObjectId(),
                        buyEquip: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });

            const archived = await persistTrader(
                coins(1, 0, 0),
                {},
                { deletedAt: ARCHIVED_AT },
            );
            const before = await raw(archived);
            await expect(
                shop.execute(
                    trade({
                        id: archived,
                        buyEquip: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(await raw(archived)).toEqual(before);

            const transaction = jest.spyOn(connection, 'transaction');
            for (const id of [new Types.ObjectId(), archived]) {
                await expect(
                    shop.execute(
                        trade({
                            id,
                            total: coins(0, 0, 0),
                            isTotalPositive: false,
                        }),
                    ),
                ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            }
            expect(transaction).not.toHaveBeenCalled();

            await expect(
                shop.execute(
                    trade({
                        id: 'abc',
                        total: coins(0, 0, 0),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        });
    });

    describe('shop city guard', () => {
        const buySword = (id: Types.ObjectId) =>
            trade({
                id,
                buyEquip: [asset(sword)],
                total: coins(0, 1, 50),
                isTotalPositive: false,
            });

        async function expectShopNotInCity(
            id: Types.ObjectId,
            request: TransactionRequest,
        ): Promise<void> {
            const before = await raw(id);

            await expect(shop.execute(request)).rejects.toMatchObject({
                code: 'SHOP_NOT_IN_CITY',
            });

            expect(await raw(id)).toEqual(before);
        }

        it('rejects a character on a point of interest that marks no city and writes nothing', async () => {
            const id = await persistTraderOutsideCity(coins(0, 5, 0));

            await expectShopNotInCity(id, buySword(id));
        });

        it('rejects a character at a city marker while travelling', async () => {
            const id = await persistTrader(
                coins(0, 5, 0),
                {},
                {},
                { activeTravel: buildActiveTravelDoc() },
            );

            await expectShopNotInCity(id, buySword(id));
        });

        it('rejects a character at a city marker while awaiting aid', async () => {
            const id = await persistTrader(
                coins(0, 5, 0),
                {},
                {},
                {
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: new Date('2026-10-24T08:00:00.000Z'),
                    },
                },
            );

            await expectShopNotInCity(id, buySword(id));
        });

        it('honours only the city marker, not the other points of interest of the city', async () => {
            const character = await persistCharacterOutsideCity(coins(0, 5, 0));
            await persistCity(cityModelOf({ connection }), {
                name: 'Borgo del Mercato',
                markerLocation: new Types.ObjectId(),
                pointsOfInterest: [character.status.location],
            });
            const id = character._id as Types.ObjectId;

            await expectShopNotInCity(id, buySword(id));
        });

        it('matches a legacy marker stored as a hex string', async () => {
            const character = await persistCharacterOutsideCity(coins(0, 5, 0));
            await cityModelOf({ connection }).collection.insertOne({
                name: 'Borgo Antico',
                markerLocation: (
                    character.status.location as Types.ObjectId
                ).toHexString(),
                pointsOfInterest: [],
            });
            const id = character._id as Types.ObjectId;

            await expect(shop.execute(buySword(id))).resolves.toEqual(SUCCESS);
        });

        it('rejects an empty zero-total trade outside a city without opening a transaction', async () => {
            const id = await persistTraderOutsideCity(coins(0, 1, 0));
            const transaction = jest.spyOn(connection, 'transaction');

            await expectShopNotInCity(
                id,
                trade({ id, total: coins(0, 0, 0), isTotalPositive: false }),
            );

            expect(transaction).not.toHaveBeenCalled();
        });

        it('rejects an empty zero-total trade of a character awaiting aid at a city marker', async () => {
            const id = await persistTrader(
                coins(0, 1, 0),
                {},
                {},
                {
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: new Date('2026-10-24T08:00:00.000Z'),
                    },
                },
            );

            await expectShopNotInCity(
                id,
                trade({ id, total: coins(0, 0, 0), isTotalPositive: false }),
            );
        });

        it('keeps ITEM_NOT_FOUND and NOT_FOUND ahead of the city guard', async () => {
            const id = await persistTraderOutsideCity(coins(0, 5, 0));

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [
                            {
                                item: new Types.ObjectId().toHexString(),
                                quantity: 1,
                            },
                        ],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
            for (const request of [
                buySword(new Types.ObjectId()),
                trade({
                    id: new Types.ObjectId(),
                    total: coins(0, 0, 0),
                    isTotalPositive: false,
                }),
            ]) {
                await expect(shop.execute(request)).rejects.toMatchObject({
                    code: 'NOT_FOUND',
                });
            }
        });

        it('rejects a travel that starts between the city check and the write', async () => {
            const id = await persistTrader(coins(0, 5, 0));
            const before = await raw(id);
            const travel = buildActiveTravelDoc();
            const cities = cityModelOf({ connection });
            const realExists = cities.exists.bind(cities);
            jest.spyOn(cities, 'exists').mockImplementationOnce((filter) => {
                const query = realExists(filter);
                const exec = query.exec.bind(query);
                query.exec = async () => {
                    const found = await exec();
                    await characters.collection.updateOne(
                        { _id: id },
                        { $set: { 'status.activeTravel': travel } },
                    );
                    return found;
                };
                return query;
            });

            await expect(shop.execute(buySword(id))).rejects.toMatchObject({
                code: 'SHOP_NOT_IN_CITY',
            });

            const after = await raw(id);
            expect(after?.status.coins).toEqual(before?.status.coins);
            expect(after?.assets).toEqual(before?.assets);
            expect(after?.status.activeTravel).toEqual(travel);
        });
    });

    describe('all-or-nothing under concurrency (SC2)', () => {
        it('lets exactly one of concurrent buys through when funds cover one', async () => {
            const id = await persistTrader(coins(0, 1, 50));
            const buySword = () =>
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                );

            const results = await Promise.allSettled([
                buySword(),
                buySword(),
                buySword(),
                buySword(),
            ]);

            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(codesOf(results)).toEqual([
                'INSUFFICIENT_FUNDS',
                'INSUFFICIENT_FUNDS',
                'INSUFFICIENT_FUNDS',
            ]);
            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 0));
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', sword, 1),
            ]);
        });

        it('sells a single owned item exactly once under concurrent sells', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [owned('EquipmentItem', sword, 1)],
            });
            const sellSword = () =>
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(sword)],
                        total: coins(0, 0, 75),
                        isTotalPositive: true,
                    }),
                );

            const results = await Promise.allSettled([
                sellSword(),
                sellSword(),
                sellSword(),
            ]);

            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            const codes = codesOf(results);
            expect(codes).toHaveLength(2);
            for (const code of codes) {
                expect([
                    'ITEM_NOT_OWNED',
                    'INSUFFICIENT_ITEM_QUANTITY',
                ]).toContain(code);
            }
            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 75));
            expect(after?.assets.ownedEquipments).toEqual([]);
        });

        it('leaves no partial state when the transaction fails after both writes', async () => {
            const id = await persistTrader(coins(0, 5, 0));
            const before = await raw(id);
            const realApply = wallet.applyCharacterCoinsDelta.bind(wallet);
            let sessionSeen: unknown;
            jest.spyOn(
                wallet,
                'applyCharacterCoinsDelta',
            ).mockImplementationOnce(async (characterId, delta, session) => {
                sessionSeen = session;
                await realApply(characterId, delta, session);
                throw new Error('induced failure');
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        total: coins(0, 1, 50),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toThrow('induced failure');

            expect(sessionSeen).toBeDefined();
            expect(await raw(id)).toEqual(before);
        });
    });
});
