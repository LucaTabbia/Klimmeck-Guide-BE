import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import type { CoinPurse } from 'src/economy/coins';
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
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { cityModelOf, placeInCity } from '../../../test/economy/place-in-city';
import {
    buildCharacter,
    persistCity,
    persistEquipmentItem,
    persistLootItem,
} from '../../../test/fixtures';
import { buildActiveTravelDoc } from '../../../test/travel/active-travel.fixture';

const DO_TRANSACTION =
    'mutation($request: TransactionRequest!) { doTransaction(request: $request) { successful response } }';

const SUCCESS = {
    successful: true,
    response: 'Transazione avvenuta con successo',
};

const SHOP_NOT_IN_CITY_MESSAGE = 'Il negozio è disponibile solo in città';

interface WireBody {
    data?: {
        doTransaction?: { successful: boolean; response: string } | null;
    } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface CatalogDocument {
    _id: unknown;
}

interface OwnedEntry {
    itemType: 'EquipmentItem' | 'LootItem';
    item: Types.ObjectId;
    quantity: number;
}

interface Inventory {
    ownedEquipments?: OwnedEntry[];
    ownedItems?: OwnedEntry[];
}

interface TradeInput {
    buyEquip?: AssetQuantityInput[];
    buyLoot?: AssetQuantityInput[];
    sellEquip?: AssetQuantityInput[];
    sellLoot?: AssetQuantityInput[];
    total: CoinPurse;
    isTotalPositive: boolean;
}

interface Catalog {
    sword: CatalogDocument;
    potion: CatalogDocument;
    relic: CatalogDocument;
}

interface RejectionCase {
    code: string;
    message: string;
    purse: CoinPurse;
    inventory: (catalog: Catalog) => Inventory;
    trade: (catalog: Catalog) => TradeInput;
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

const owned = (
    itemType: OwnedEntry['itemType'],
    document: CatalogDocument,
    quantity: number,
): OwnedEntry => ({ itemType, item: idOf(document), quantity });

const REJECTIONS: RejectionCase[] = [
    {
        code: 'TRANSACTION_TOTAL_MISMATCH',
        message: 'Il totale non corrisponde ai prezzi attuali del negozio',
        purse: coins(0, 5, 0),
        inventory: () => ({}),
        trade: ({ sword }) => ({
            buyEquip: [asset(sword)],
            total: coins(0, 0, 1),
            isTotalPositive: false,
        }),
    },
    {
        code: 'ITEM_NOT_FOUND',
        message: 'Oggetto non trovato nel catalogo',
        purse: coins(0, 5, 0),
        inventory: () => ({}),
        trade: () => ({
            buyEquip: [
                { item: new Types.ObjectId().toHexString(), quantity: 1 },
            ],
            total: coins(0, 0, 0),
            isTotalPositive: false,
        }),
    },
    {
        code: 'ITEM_NOT_TRADABLE',
        message: 'Oggetto non scambiabile',
        purse: coins(0, 5, 0),
        inventory: () => ({}),
        trade: ({ relic }) => ({
            buyLoot: [asset(relic)],
            total: coins(0, 0, 0),
            isTotalPositive: false,
        }),
    },
    {
        code: 'INVALID_QUANTITY',
        message: 'Quantità non valida',
        purse: coins(0, 5, 0),
        inventory: () => ({}),
        trade: ({ sword }) => ({
            buyEquip: [asset(sword, 0)],
            total: coins(0, 0, 0),
            isTotalPositive: false,
        }),
    },
    {
        code: 'ITEM_NOT_OWNED',
        message: 'Oggetto non posseduto',
        purse: coins(0, 5, 0),
        inventory: () => ({}),
        trade: ({ sword }) => ({
            sellEquip: [asset(sword)],
            total: coins(0, 0, 75),
            isTotalPositive: true,
        }),
    },
    {
        code: 'INSUFFICIENT_ITEM_QUANTITY',
        message: 'Quantità posseduta insufficiente',
        purse: coins(0, 5, 0),
        inventory: ({ potion }) => ({
            ownedItems: [owned('LootItem', potion, 1)],
        }),
        trade: ({ potion }) => ({
            sellLoot: [asset(potion, 2)],
            total: coins(0, 0, 20),
            isTotalPositive: true,
        }),
    },
    {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Monete insufficienti',
        purse: coins(0, 1, 0),
        inventory: () => ({}),
        trade: ({ sword }) => ({
            buyEquip: [asset(sword)],
            total: coins(0, 1, 50),
            isTotalPositive: false,
        }),
    },
];

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

function isSuccess(body: WireBody): boolean {
    return body.data?.doTransaction?.successful === true;
}

describe('doTransaction (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let equipment: Model<EquipmentItemDocument>;
    let loot: Model<LootItemDocument>;
    let catalog: Catalog;

    function playerOutsideCity(
        twitchId: string,
        purse: CoinPurse,
        inventory: Inventory = {},
        status: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        const base = buildCharacter();
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: { ...base.status, coins: purse, ...status },
                assets: { ...base.assets, ...inventory },
            },
        });
    }

    // il negozio risponde solo in città (D-18): il giocatore sta sul marker di una città
    async function playerWith(
        twitchId: string,
        purse: CoinPurse,
        inventory: Inventory = {},
        status: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        const player = await playerOutsideCity(
            twitchId,
            purse,
            inventory,
            status,
        );
        await placeInCity(harness, player.character!);
        return player;
    }

    function characterIdOf(player: TestPlayer): Types.ObjectId {
        return player.character?._id as Types.ObjectId;
    }

    function raw(player: TestPlayer) {
        return characters.collection.findOne({ _id: characterIdOf(player) });
    }

    async function doTransaction(
        player: TestPlayer,
        {
            buyEquip = [],
            buyLoot = [],
            sellEquip = [],
            sellLoot = [],
            total,
            isTotalPositive,
        }: TradeInput,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            DO_TRANSACTION,
            {
                request: {
                    id: characterIdOf(player).toHexString(),
                    boughtItems: { equipAssets: buyEquip, lootAssets: buyLoot },
                    soldItems: { equipAssets: sellEquip, lootAssets: sellLoot },
                    total,
                    isTotalPositive,
                },
            },
            player.bearer,
        );
        return response.body as WireBody;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        equipment = harness.connection.model<EquipmentItemDocument>(
            EquipmentItem.name,
        );
        loot = harness.connection.model<LootItemDocument>(LootItem.name);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([characters.init(), equipment.init(), loot.init()]);
    });

    beforeEach(async () => {
        catalog = {
            sword: await persistEquipmentItem(equipment), // buy 150, sell 75
            potion: await persistLootItem(loot), // buy 20, sell 10
            relic: await persistLootItem(loot, {
                name: 'Reliquia',
                buyPrice: null,
                sellPrice: null,
            }),
        };
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('buys at catalog prices on the wire', async () => {
        const player = await playerWith('twitch-trade-buy', coins(0, 5, 0));

        const body = await doTransaction(player, {
            buyEquip: [asset(catalog.sword)],
            total: coins(0, 1, 50),
            isTotalPositive: false,
        });

        expect(body.errors).toBeUndefined();
        expect(body.data?.doTransaction).toEqual(SUCCESS);
        const after = await raw(player);
        expect(after?.status.coins).toEqual(coins(0, 3, 50));
        expect(after?.assets.ownedEquipments).toEqual([
            owned('EquipmentItem', catalog.sword, 1),
        ]);
    });

    it.each(REJECTIONS)(
        'answers $code on the wire and writes nothing',
        async ({ code, message, purse, inventory, trade }) => {
            const player = await playerWith(
                `twitch-trade-${code.toLowerCase()}`,
                purse,
                inventory(catalog),
            );
            const before = await raw(player);

            const body = await doTransaction(player, trade(catalog));

            expect(body.data?.doTransaction ?? null).toBeNull();
            expect(body.errors?.[0]?.extensions).toEqual({ code });
            expect(body.errors?.[0]?.message).toBe(message);
            expect(await raw(player)).toEqual(before);
        },
    );

    it('lets exactly one of concurrent wire buys through', async () => {
        const player = await playerWith('twitch-trade-race', coins(0, 1, 50));
        const buy: TradeInput = {
            buyEquip: [asset(catalog.sword)],
            total: coins(0, 1, 50),
            isTotalPositive: false,
        };

        const bodies = await Promise.all(
            Array.from({ length: 5 }, () => doTransaction(player, buy)),
        );

        expect(bodies.filter(isSuccess)).toHaveLength(1);
        expect(bodies.filter((body) => !isSuccess(body)).map(codeOf)).toEqual(
            Array.from({ length: 4 }, () => 'INSUFFICIENT_FUNDS'),
        );
        const after = await raw(player);
        expect(after?.status.coins).toEqual(coins(0, 0, 0));
        expect(after?.assets.ownedEquipments).toEqual([
            owned('EquipmentItem', catalog.sword, 1),
        ]);
    });

    it('keeps an empty zero-total trade a valid no-op for the owner', async () => {
        const player = await playerWith('twitch-trade-empty', coins(0, 5, 0));
        const before = await raw(player);

        const body = await doTransaction(player, {
            total: coins(0, 0, 0),
            isTotalPositive: false,
        });

        expect(body.errors).toBeUndefined();
        expect(body.data?.doTransaction).toEqual(SUCCESS);
        expect(await raw(player)).toEqual(before);
    });

    describe('shop city guard', () => {
        const buySword = (): TradeInput => ({
            buyEquip: [asset(catalog.sword)],
            total: coins(0, 1, 50),
            isTotalPositive: false,
        });

        async function expectShopNotInCity(
            player: TestPlayer,
            trade: TradeInput,
        ): Promise<void> {
            const before = await raw(player);

            const body = await doTransaction(player, trade);

            expect(body.data?.doTransaction ?? null).toBeNull();
            expect(body.errors?.[0]?.extensions).toEqual({
                code: 'SHOP_NOT_IN_CITY',
            });
            expect(body.errors?.[0]?.message).toBe(SHOP_NOT_IN_CITY_MESSAGE);
            expect(await raw(player)).toEqual(before);
        }

        it('rejects a character on a point of interest that marks no city', async () => {
            const player = await playerOutsideCity(
                'twitch-shop-wild',
                coins(0, 5, 0),
            );

            await expectShopNotInCity(player, buySword());
        });

        it('rejects a character at a city marker while travelling', async () => {
            const player = await playerWith(
                'twitch-shop-travel',
                coins(0, 5, 0),
                {},
                { activeTravel: buildActiveTravelDoc() },
            );

            await expectShopNotInCity(player, buySword());
        });

        it('rejects a character at a city marker while awaiting aid', async () => {
            const player = await playerWith(
                'twitch-shop-aid',
                coins(0, 5, 0),
                {},
                {
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: new Date('2026-10-24T08:00:00.000Z'),
                    },
                },
            );

            await expectShopNotInCity(player, buySword());
        });

        it('rejects a character on a point of interest of a city that is not its marker', async () => {
            const player = await playerOutsideCity(
                'twitch-shop-district',
                coins(0, 5, 0),
            );
            await persistCity(cityModelOf(harness), {
                name: 'Borgo del Mercato',
                markerLocation: new Types.ObjectId(),
                pointsOfInterest: [player.character!.status.location],
            });

            await expectShopNotInCity(player, buySword());
        });

        it('rejects an empty zero-total trade outside a city', async () => {
            const player = await playerOutsideCity(
                'twitch-shop-empty-wild',
                coins(0, 5, 0),
            );

            await expectShopNotInCity(player, {
                total: coins(0, 0, 0),
                isTotalPositive: false,
            });
        });

        it('keeps ITEM_NOT_FOUND ahead of the city guard', async () => {
            const player = await playerOutsideCity(
                'twitch-shop-unknown-wild',
                coins(0, 5, 0),
            );

            const body = await doTransaction(player, {
                buyEquip: [
                    { item: new Types.ObjectId().toHexString(), quantity: 1 },
                ],
                total: coins(0, 0, 0),
                isTotalPositive: false,
            });

            expect(body.errors?.[0]?.extensions).toEqual({
                code: 'ITEM_NOT_FOUND',
            });
        });
    });
});
