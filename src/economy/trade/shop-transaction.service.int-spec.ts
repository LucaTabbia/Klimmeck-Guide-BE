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
import { Pet, PetDocument } from 'src/models/pet.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';
import { User, UserDocument } from 'src/models/user.model';
import {
    cityModelOf,
    placeInCity,
    type ShopPoolFixture,
} from '../../../test/economy/place-in-city';
import {
    buildCharacter,
    persistCharacter,
    persistCity,
    persistEquipmentItem,
    persistLootItem,
    persistPet,
} from '../../../test/fixtures';
import {
    buildOwnedPet,
    type OwnedPetSeed,
} from '../../../test/fixtures/owned-pet.fixture';
import { buildActiveTravelDoc } from '../../../test/travel/active-travel.fixture';
import { migrateLegacyRefs } from '../../../test/migrations/migrate-legacy-refs';

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
    buyPets?: AssetQuantityInput[];
    sellPets?: AssetQuantityInput[];
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
    buyPets,
    sellPets,
    total,
    isTotalPositive,
}: TradeInput): TransactionRequest {
    return {
        id: id.toString(),
        boughtItems: {
            equipAssets: buyEquip,
            lootAssets: buyLoot,
            ...(buyPets ? { petAssets: buyPets } : {}),
        },
        soldItems: {
            equipAssets: sellEquip,
            lootAssets: sellLoot,
            ...(sellPets ? { petAssets: sellPets } : {}),
        },
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
    let pets: Model<PetDocument>;
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
        pets = app.get<Model<PetDocument>>(getModelToken(Pet.name));
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([
            characters.init(),
            users.init(),
            equipment.init(),
            loot.init(),
            pets.init(),
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
            pets.deleteMany({}),
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
        wornEquipment?: Record<string, Types.ObjectId | null>;
        ownedPets?: OwnedPetSeed[];
        pet?: Types.ObjectId | null;
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

    // il pool della città del trader contiene le fixture del catalogo (D-19)
    const catalogPool = (): ShopPoolFixture => ({
        equipment: [idOf(sword)],
        loot: [idOf(potion), idOf(relic)],
    });

    // il negozio risponde solo in città (D-18): il trader sta sul marker di una città
    async function persistTrader(
        purse: CoinPurse,
        inventory: TraderInventory = {},
        overrides: Record<string, unknown> = {},
        status: Record<string, unknown> = {},
        pool: ShopPoolFixture = catalogPool(),
    ): Promise<Types.ObjectId> {
        const character = await persistCharacterOutsideCity(
            purse,
            inventory,
            overrides,
            status,
        );
        await placeInCity({ connection }, character, pool);
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
                wornEquipment: {
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
            expect(after?.assets.wornEquipment.rightHand).toBeNull();
            expect(after?.assets.wornEquipment.head).toEqual(idOf(helmet));
        });

        it('empties the worn slot of a sold equipment (D-06)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [owned('EquipmentItem', sword, 1)],
                wornEquipment: { feet: idOf(sword) },
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
            expect(after?.assets.ownedEquipments).toEqual([]);
            expect(after?.assets.wornEquipment.feet).toBeNull();
        });

        it('keeps a worn equipment equipped while a copy remains', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [owned('EquipmentItem', sword, 2)],
                wornEquipment: { rightHand: idOf(sword) },
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
            expect(after?.assets.wornEquipment.rightHand).toEqual(idOf(sword));
        });

        it('sells a legacy entry whose item id was stored as a string after the reference migration (D-17d)', async () => {
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
            await migrateLegacyRefs(connection);

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
                { itemType: 'LootItem', item: idOf(potion), quantity: 1 },
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

        it('settles a trade that nets to zero without touching the wallet', async () => {
            const id = await persistTrader(coins(0, 0, 7), {
                ownedItems: [owned('LootItem', potion, 15)],
            });
            const delta = jest.spyOn(wallet, 'applyCharacterCoinsDelta');

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyEquip: [asset(sword)],
                        sellLoot: [asset(potion, 15)],
                        total: coins(0, 0, 0),
                        isTotalPositive: false,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            expect(delta).not.toHaveBeenCalled();
            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 7));
            expect(after?.assets.ownedItems).toEqual([]);
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', sword, 1),
            ]);
        });

        it('buys for a legacy character stored without an inventory', async () => {
            const id = await persistTrader(coins(0, 1, 0));
            await characters.collection.updateOne(
                { _id: id },
                { $unset: { assets: '' } },
            );

            await expect(
                shop.execute(
                    trade({
                        id,
                        buyLoot: [asset(potion)],
                        total: coins(0, 0, 20),
                        isTotalPositive: false,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 80));
            expect(after?.assets).toEqual({
                ownedItems: [owned('LootItem', potion, 1)],
                ownedEquipments: [],
            });
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

        it('rejects an imprisoned character at a city marker with CHARACTER_IMPRISONED and writes nothing (quick 261110-cgd)', async () => {
            const until = new Date('2999-01-01T00:00:00.000Z');
            const id = await persistTrader(
                coins(0, 5, 0),
                {},
                {},
                { imprisonedUntil: until },
            );
            const before = await raw(id);

            await expect(shop.execute(buySword(id))).rejects.toMatchObject({
                code: 'CHARACTER_IMPRISONED',
                extensions: {
                    code: 'CHARACTER_IMPRISONED',
                    imprisonedUntil: until.toISOString(),
                },
            });
            await expect(
                shop.execute(
                    trade({
                        id,
                        total: coins(0, 0, 0),
                        isTotalPositive: false,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'CHARACTER_IMPRISONED' });
            expect(await raw(id)).toEqual(before);
        });

        it('trades once the prison has ended (quick 261110-cgd)', async () => {
            const id = await persistTrader(
                coins(0, 5, 0),
                {},
                {},
                { imprisonedUntil: new Date('2000-01-01T00:00:00.000Z') },
            );

            await expect(shop.execute(buySword(id))).resolves.toEqual(SUCCESS);
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

        it('matches a legacy marker stored as a hex string after the reference migration (D-17d)', async () => {
            const character = await persistCharacterOutsideCity(coins(0, 5, 0));
            await cityModelOf({ connection }).collection.insertOne({
                name: 'Borgo Antico',
                markerLocation: (
                    character.status.location as Types.ObjectId
                ).toHexString(),
                pointsOfInterest: [],
                shop: { equipment: [idOf(sword)] },
            });
            await migrateLegacyRefs(connection);
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
            const realFindOne = cities.findOne.bind(cities);
            // findOne è sovraccaricato: lo spy tipizzato vede solo la firma a un argomento
            (
                jest.spyOn(cities, 'findOne') as jest.SpyInstance
            ).mockImplementationOnce((filter: unknown, projection: unknown) => {
                const query = realFindOne(filter as never, projection);
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

    describe('city pool guard', () => {
        const buyEquipment = (
            id: Types.ObjectId,
            document: CatalogDocument,
        ): TransactionRequest =>
            trade({
                id,
                buyEquip: [asset(document)],
                total: coins(0, 1, 50),
                isTotalPositive: false,
            });

        async function expectItemNotInShop(
            id: Types.ObjectId,
            request: TransactionRequest,
        ): Promise<void> {
            const before = await raw(id);

            await expect(shop.execute(request)).rejects.toMatchObject({
                code: 'ITEM_NOT_IN_SHOP',
            });

            expect(await raw(id)).toEqual(before);
        }

        it('refuses an equipment outside the pool with ITEM_NOT_IN_SHOP and writes nothing (D-19)', async () => {
            const outside = await persistEquipmentItem(equipment, {
                name: 'Fuori pool',
            });
            const id = await persistTrader(coins(1, 0, 0));

            await expectItemNotInShop(id, buyEquipment(id, outside));
        });

        it('refuses a loot outside the pool with ITEM_NOT_IN_SHOP (D-19)', async () => {
            const id = await persistTrader(
                coins(1, 0, 0),
                {},
                {},
                {},
                { equipment: [idOf(sword)] },
            );

            await expectItemNotInShop(
                id,
                trade({
                    id,
                    buyLoot: [asset(potion)],
                    total: coins(0, 0, 20),
                    isTotalPositive: false,
                }),
            );
        });

        it('refuses a legendary curated in the pool with ITEM_NOT_IN_SHOP (D-05)', async () => {
            const crown = await persistEquipmentItem(equipment, {
                name: 'Corona del Re',
                rarity: 'legendary',
            });
            const id = await persistTrader(
                coins(1, 0, 0),
                {},
                {},
                {},
                { equipment: [idOf(crown)] },
            );

            await expectItemNotInShop(id, buyEquipment(id, crown));
        });

        it('refuses a sellable false loot curated in the pool (D-05)', async () => {
            const seal = await persistLootItem(loot, {
                name: 'Sigillo',
                sellable: false,
            });
            const id = await persistTrader(
                coins(1, 0, 0),
                {},
                {},
                {},
                { loot: [idOf(seal)] },
            );

            await expectItemNotInShop(
                id,
                trade({
                    id,
                    buyLoot: [asset(seal)],
                    total: coins(0, 0, 20),
                    isTotalPositive: false,
                }),
            );
        });

        it('buys an ultrarare item curated by hand in the pool (D-05)', async () => {
            const blade = await persistEquipmentItem(equipment, {
                name: 'Lama del Mare',
                rarity: 'ultrarare',
            });
            const id = await persistTrader(
                coins(0, 5, 0),
                {},
                {},
                {},
                { equipment: [idOf(blade)] },
            );

            await expect(
                shop.execute(buyEquipment(id, blade)),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 3, 50));
            expect(after?.assets.ownedEquipments).toEqual([
                owned('EquipmentItem', blade, 1),
            ]);
        });

        it('sells an item outside the pool of the city (D-12)', async () => {
            const id = await persistTrader(
                coins(0, 0, 0),
                { ownedEquipments: [owned('EquipmentItem', sword, 1)] },
                {},
                {},
                { equipment: [], loot: [], pets: [] },
            );

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
            expect(after?.status.coins).toEqual(coins(0, 0, 75));
            expect(after?.assets.ownedEquipments).toEqual([]);
        });

        it('sells a legendary item owned by the character (D-11)', async () => {
            const crown = await persistEquipmentItem(equipment, {
                name: 'Corona del Re',
                rarity: 'legendary',
                sellable: false,
            });
            const id = await persistTrader(coins(0, 0, 0), {
                ownedEquipments: [owned('EquipmentItem', crown, 1)],
            });

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(crown)],
                        total: coins(0, 0, 75),
                        isTotalPositive: true,
                    }),
                ),
            ).resolves.toEqual(SUCCESS);

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 0, 75));
            expect(after?.assets.ownedEquipments).toEqual([]);
        });

        it('answers SHOP_NOT_IN_CITY before the pool outside a city (D-19)', async () => {
            const outside = await persistEquipmentItem(equipment, {
                name: 'Fuori pool',
            });
            const id = await persistTraderOutsideCity(coins(1, 0, 0));

            await expect(
                shop.execute(buyEquipment(id, outside)),
            ).rejects.toMatchObject({ code: 'SHOP_NOT_IN_CITY' });
        });

        it('checks the pool before the possession and the funds (D-19)', async () => {
            const outside = await persistEquipmentItem(equipment, {
                name: 'Fuori pool',
            });
            const id = await persistTrader(coins(0, 0, 0));

            await expectItemNotInShop(
                id,
                trade({
                    id,
                    buyEquip: [asset(outside)],
                    sellLoot: [asset(potion)],
                    total: coins(0, 1, 40),
                    isTotalPositive: false,
                }),
            );
        });

        it('reads the pool with the session of the transaction (D-19)', async () => {
            const id = await persistTrader(coins(0, 5, 0));
            const findOne = jest.spyOn(cityModelOf({ connection }), 'findOne');

            await expect(
                shop.execute(buyEquipment(id, sword)),
            ).resolves.toEqual(SUCCESS);

            expect(findOne).toHaveBeenCalledTimes(1);
            const query = findOne.mock.results[0]?.value as {
                getOptions(): { session?: unknown };
                projection(): unknown;
            };
            expect(query.getOptions().session).toBeDefined();
            expect(query.projection()).toEqual({ shop: 1 });
        });
    });

    describe('pets in the shop transaction', () => {
        let horse: CatalogDocument;
        let camel: CatalogDocument;

        // il pool del negozio con i due pet in vendita (D-19)
        const petPool = (): ShopPoolFixture => ({
            ...catalogPool(),
            pets: [idOf(horse), idOf(camel)],
        });

        const buyPet = (
            id: Types.ObjectId,
            document: CatalogDocument,
        ): TransactionRequest =>
            trade({
                id,
                buyPets: [asset(document)],
                total: coins(1, 0, 0),
                isTotalPositive: false,
            });

        const sellPet = (
            id: Types.ObjectId,
            document: CatalogDocument,
        ): TransactionRequest =>
            trade({
                id,
                sellPets: [asset(document)],
                total: coins(0, 50, 0),
                isTotalPositive: true,
            });

        async function expectRefused(
            id: Types.ObjectId,
            request: TransactionRequest,
            code: string,
        ): Promise<void> {
            const before = await raw(id);

            await expect(shop.execute(request)).rejects.toMatchObject({
                code,
            });

            expect(await raw(id)).toEqual(before);
        }

        beforeEach(async () => {
            const price = {
                buyPrice: coins(1, 0, 0),
                sellPrice: coins(0, 50, 0),
                sellable: true,
            };
            horse = await persistPet(pets, {
                name: 'Cavallo da viaggio',
                ...price,
            });
            camel = await persistPet(pets, {
                name: 'Cammello del Mar Sabbioso',
                ...price,
            });
        });

        it('buys a pet of the city pool into the owned pets without equipping it (D-14)', async () => {
            const id = await persistTrader(
                coins(2, 0, 0),
                { ownedPets: [buildOwnedPet(idOf(camel))] },
                {},
                {},
                petPool(),
            );

            await expect(shop.execute(buyPet(id, horse))).resolves.toEqual(
                SUCCESS,
            );

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(1, 0, 0));
            expect(after?.assets.ownedPets).toEqual([
                buildOwnedPet(idOf(camel)),
                buildOwnedPet(idOf(horse)),
            ]);
            expect(after?.assets.pet).toBeNull();
        });

        it('stores a bought pet as an entry with the catalogue life points (D-03)', async () => {
            const drake = await persistPet(pets, {
                name: 'Drago nano',
                buyPrice: coins(1, 0, 0),
                sellPrice: coins(0, 50, 0),
                sellable: true,
                maxLifePoints: 300,
            });
            const id = await persistTrader(
                coins(2, 0, 0),
                {
                    ownedPets: [
                        buildOwnedPet(idOf(camel), {
                            xp: 40,
                            currentLifePoints: 6,
                        }),
                    ],
                },
                {},
                {},
                { ...catalogPool(), pets: [idOf(drake)] },
            );

            await shop.execute(buyPet(id, drake));

            expect((await raw(id))?.assets.ownedPets).toEqual([
                { pet: idOf(camel), xp: 40, currentLifePoints: 6 },
                { pet: idOf(drake), xp: 0, currentLifePoints: 300 },
            ]);
        });

        it('removes the entry and keeps the state of the other pets on a sale (D-03)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedPets: [
                    buildOwnedPet(idOf(camel), {
                        xp: 40,
                        currentLifePoints: 6,
                    }),
                    buildOwnedPet(idOf(horse), {
                        xp: 15,
                        currentLifePoints: 2,
                    }),
                ],
                pet: idOf(horse),
            });

            await shop.execute(sellPet(id, horse));

            const after = await raw(id);
            expect(after?.assets.ownedPets).toEqual([
                { pet: idOf(camel), xp: 40, currentLifePoints: 6 },
            ]);
            expect(after?.assets.pet).toBeNull();
        });

        describe('the lore of a pet', () => {
            const page = new Types.ObjectId();
            const tale = new Types.ObjectId();

            const persistStoried = () =>
                persistPet(pets, {
                    name: 'Drago nano',
                    buyPrice: coins(1, 0, 0),
                    sellPrice: coins(0, 50, 0),
                    sellable: true,
                    relatedLore: [page, tale],
                });

            it('unlocks the lore of a bought pet in the purchase write (D-26)', async () => {
                const drake = await persistStoried();
                const id = await persistTrader(
                    coins(2, 0, 0),
                    {},
                    {},
                    { unlockedLore: [tale] },
                    { ...catalogPool(), pets: [idOf(drake)] },
                );

                await shop.execute(buyPet(id, drake));

                const after = await raw(id);
                expect(after?.status.unlockedLore).toEqual([tale, page]);
                expect(after?.assets.ownedPets).toEqual([
                    buildOwnedPet(idOf(drake)),
                ]);
            });

            it('keeps the unlocked lore when the pet is sold (D-26)', async () => {
                const drake = await persistStoried();
                const id = await persistTrader(
                    coins(0, 0, 0),
                    { ownedPets: [buildOwnedPet(idOf(drake))] },
                    {},
                    { unlockedLore: [page, tale] },
                );

                await shop.execute(sellPet(id, drake));

                const after = await raw(id);
                expect(after?.status.unlockedLore).toEqual([page, tale]);
                expect(after?.assets.ownedPets).toEqual([]);
            });

            it('leaves the unlocked lore untouched when the bought pet has no lore (D-26)', async () => {
                const id = await persistTrader(
                    coins(2, 0, 0),
                    {},
                    {},
                    { unlockedLore: [tale] },
                    petPool(),
                );

                await shop.execute(buyPet(id, horse));

                const after = await raw(id);
                expect(after?.status.unlockedLore).toEqual([tale]);
                expect(after?.assets.ownedPets).toEqual([
                    buildOwnedPet(idOf(horse)),
                ]);
            });
        });

        it('refuses a pet already owned with PET_ALREADY_OWNED and writes nothing (D-14)', async () => {
            const id = await persistTrader(
                coins(2, 0, 0),
                { ownedPets: [buildOwnedPet(idOf(horse))] },
                {},
                {},
                petPool(),
            );

            await expectRefused(id, buyPet(id, horse), 'PET_ALREADY_OWNED');
        });

        it('refuses a pet outside the pool before checking a duplicate (D-19)', async () => {
            const id = await persistTrader(
                coins(2, 0, 0),
                { ownedPets: [buildOwnedPet(idOf(horse))] },
                {},
                {},
                { ...catalogPool(), pets: [idOf(camel)] },
            );

            await expectRefused(id, buyPet(id, horse), 'ITEM_NOT_IN_SHOP');
        });

        it('refuses a duplicate pet before the funds (D-19)', async () => {
            const id = await persistTrader(
                coins(0, 0, 0),
                { ownedPets: [buildOwnedPet(idOf(horse))] },
                {},
                {},
                petPool(),
            );

            await expectRefused(id, buyPet(id, horse), 'PET_ALREADY_OWNED');
        });

        it('refuses a quest-only pet curated in the pool with ITEM_NOT_IN_SHOP (D-05)', async () => {
            const griffin = await persistPet(pets, {
                name: 'Grifone di Kliever',
                buyPrice: coins(1, 0, 0),
                sellable: false,
            });
            const id = await persistTrader(
                coins(2, 0, 0),
                {},
                {},
                {},
                { ...catalogPool(), pets: [idOf(griffin)] },
            );

            await expectRefused(id, buyPet(id, griffin), 'ITEM_NOT_IN_SHOP');
        });

        it('sells an owned pet in any city (D-12, D-14)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedPets: [
                    buildOwnedPet(idOf(camel)),
                    buildOwnedPet(idOf(horse)),
                ],
                pet: idOf(camel),
            });

            await expect(shop.execute(sellPet(id, horse))).resolves.toEqual(
                SUCCESS,
            );

            const after = await raw(id);
            expect(after?.status.coins).toEqual(coins(0, 50, 0));
            expect(after?.assets.ownedPets).toEqual([
                buildOwnedPet(idOf(camel)),
            ]);
        });

        it('empties the equipped slot when selling the equipped pet (D-14)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedPets: [buildOwnedPet(idOf(horse))],
                pet: idOf(horse),
            });

            await shop.execute(sellPet(id, horse));

            const after = await raw(id);
            expect(after?.assets.ownedPets).toEqual([]);
            expect(after?.assets.pet).toBeNull();
            expect(after?.status.coins).toEqual(coins(0, 50, 0));
        });

        it('keeps the equipped pet when selling another owned pet (D-14)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedPets: [
                    buildOwnedPet(idOf(camel)),
                    buildOwnedPet(idOf(horse)),
                ],
                pet: idOf(camel),
            });

            await shop.execute(sellPet(id, horse));

            const after = await raw(id);
            expect(after?.assets.ownedPets).toEqual([
                buildOwnedPet(idOf(camel)),
            ]);
            expect(after?.assets.pet).toEqual(idOf(camel));
        });

        it('refuses selling a pet not owned with ITEM_NOT_OWNED (D-14)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedPets: [buildOwnedPet(idOf(camel))],
                pet: idOf(camel),
            });

            await expectRefused(id, sellPet(id, horse), 'ITEM_NOT_OWNED');
        });

        it('leaves the pet fields out of a trade without pet lines (Pitfall 5)', async () => {
            const id = await persistTrader(coins(0, 1, 0));
            await characters.collection.updateOne({ _id: id }, {
                $unset: { 'assets.ownedPets': '', 'assets.pet': '' },
            } as never);

            await shop.execute(
                trade({
                    id,
                    buyLoot: [asset(potion)],
                    total: coins(0, 0, 20),
                    isTotalPositive: false,
                }),
            );

            const after = await raw(id);
            expect(Object.keys(after?.assets ?? {}).sort()).toEqual([
                'ownedEquipments',
                'ownedItems',
                'wornEquipment',
            ]);
        });

        it('refuses a pet bought meanwhile at write time and pays nothing (D-14)', async () => {
            const id = await persistTrader(
                coins(2, 0, 0),
                { ownedPets: [buildOwnedPet(idOf(horse))] },
                {},
                {},
                petPool(),
            );
            const before = await raw(id);
            const realFindOne = characters.findOne.bind(characters);
            // lo snapshot non vede ancora il pet che un acquisto concorrente ha già aggiunto: decide la guardia della scrittura
            jest.spyOn(characters, 'findOne').mockImplementationOnce(((
                filter: Record<string, unknown>,
                projection: Record<string, unknown>,
            ) => {
                const query = realFindOne(filter, projection);
                const exec = query.exec.bind(query);
                query.exec = async () => {
                    const snapshot = (await exec()) as {
                        assets?: Record<string, unknown>;
                    } | null;
                    return {
                        ...snapshot,
                        assets: { ...snapshot?.assets, ownedPets: [] },
                    };
                };
                return query;
            }) as unknown as typeof characters.findOne);
            const delta = jest.spyOn(wallet, 'applyCharacterCoinsDelta');

            await expect(shop.execute(buyPet(id, horse))).rejects.toMatchObject(
                { code: 'INSUFFICIENT_ITEM_QUANTITY' },
            );

            expect(delta).not.toHaveBeenCalled();
            expect(await raw(id)).toEqual(before);
        });

        it('refuses a pet sold meanwhile at write time and pays nothing (D-14)', async () => {
            const id = await persistTrader(coins(0, 0, 0), {
                ownedPets: [buildOwnedPet(idOf(camel))],
            });
            const before = await raw(id);
            const realFindOne = characters.findOne.bind(characters);
            // lo snapshot vede ancora il pet che una vendita concorrente ha già tolto: decide la guardia della scrittura
            jest.spyOn(characters, 'findOne').mockImplementationOnce(((
                filter: Record<string, unknown>,
                projection: Record<string, unknown>,
            ) => {
                const query = realFindOne(filter, projection);
                const exec = query.exec.bind(query);
                query.exec = async () => {
                    const snapshot = (await exec()) as {
                        assets?: Record<string, unknown>;
                    } | null;
                    return {
                        ...snapshot,
                        assets: {
                            ...snapshot?.assets,
                            ownedPets: [
                                buildOwnedPet(idOf(camel)),
                                buildOwnedPet(idOf(horse)),
                            ],
                        },
                    };
                };
                return query;
            }) as unknown as typeof characters.findOne);
            const delta = jest.spyOn(wallet, 'applyCharacterCoinsDelta');

            await expect(
                shop.execute(sellPet(id, horse)),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_ITEM_QUANTITY' });

            expect(delta).not.toHaveBeenCalled();
            expect(await raw(id)).toEqual(before);
        });

        it('lets exactly one of concurrent buys of the same pet through (D-14)', async () => {
            const id = await persistTrader(
                coins(5, 0, 0),
                {},
                {},
                {},
                petPool(),
            );

            const results = await Promise.allSettled([
                shop.execute(buyPet(id, horse)),
                shop.execute(buyPet(id, horse)),
                shop.execute(buyPet(id, horse)),
            ]);

            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            for (const code of codesOf(results)) {
                expect([
                    'PET_ALREADY_OWNED',
                    'INSUFFICIENT_ITEM_QUANTITY',
                ]).toContain(code);
            }
            const after = await raw(id);
            expect(after?.assets.ownedPets).toEqual([
                buildOwnedPet(idOf(horse)),
            ]);
            expect(after?.status.coins).toEqual(coins(4, 0, 0));
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

        it('pays nothing when the sold copy is gone at write time (INSUFFICIENT_ITEM_QUANTITY)', async () => {
            const id = await persistTrader(coins(0, 0, 0));
            const before = await raw(id);
            const realFindOne = characters.findOne.bind(characters);
            // lo snapshot vede ancora la copia che un equip o una vendita concorrente ha già tolto: decide la guard della scrittura
            jest.spyOn(characters, 'findOne').mockImplementationOnce(((
                filter: Record<string, unknown>,
                projection: Record<string, unknown>,
            ) => {
                const query = realFindOne(filter, projection);
                const exec = query.exec.bind(query);
                query.exec = async () => {
                    const snapshot = (await exec()) as {
                        assets?: Record<string, unknown>;
                    } | null;
                    return {
                        ...snapshot,
                        assets: {
                            ...snapshot?.assets,
                            ownedEquipments: [owned('EquipmentItem', sword, 1)],
                        },
                    };
                };
                return query;
            }) as unknown as typeof characters.findOne);
            const delta = jest.spyOn(wallet, 'applyCharacterCoinsDelta');

            await expect(
                shop.execute(
                    trade({
                        id,
                        sellEquip: [asset(sword)],
                        total: coins(0, 0, 75),
                        isTotalPositive: true,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_ITEM_QUANTITY' });

            expect(delta).not.toHaveBeenCalled();
            expect(await raw(id)).toEqual(before);
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
