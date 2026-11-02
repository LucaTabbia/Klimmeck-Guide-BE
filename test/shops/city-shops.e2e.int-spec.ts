import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import { City } from 'src/models/city.model';
import { Character } from 'src/models/character/character.model';
import type { AssetQuantityInput } from 'src/models/common/asset-quantity.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Pet } from 'src/models/pet.model';
import { ShopPoolSeeder } from 'src/shops/maintenance/shop-pool.seeder';
import { ShopsModule } from 'src/shops/shops.module';
import { AuthTestApp, graphqlRequest } from '../auth/auth-test-app';
import { createCharactersTestApp } from '../authz/characters-test-app';
import { createPlayer, TestPlayer } from '../authz/player-fixture';
import { buildCharacter } from '../fixtures';
import {
    persistShopCatalogue,
    persistShopCities,
    ShopWorldModels,
} from './shop-world.fixture';

const CITY_SHOP = `query($cityId: ID!) {
    cityShop(cityId: $cityId) {
        city { name hasShop }
        equipment { quantity item { ... on EquipmentItem { id rarity } } }
        loot { quantity item { ... on LootItem { id rarity } } }
        pets { id }
    }
}`;
const DO_TRANSACTION =
    'mutation($request: TransactionRequest!) { doTransaction(request: $request) { successful response } }';
const EQUIP_PET =
    'mutation($request: EquipPetRequest!) { equipPet(request: $request) { successful } }';
const SUCCESS = {
    successful: true,
    response: 'Transazione avvenuta con successo',
};

interface CoinPurse {
    gold: number;
    silver: number;
    copper: number;
}

interface ShelfEntry {
    quantity: number;
    item: { id: string; rarity: string };
}

interface CityShopWire {
    city: { name: string; hasShop: boolean };
    equipment: ShelfEntry[];
    loot: ShelfEntry[];
    pets: { id: string }[];
}

interface WireBody {
    data?: Record<string, any> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface Trade {
    buyEquip?: AssetQuantityInput[];
    buyPets?: AssetQuantityInput[];
    sellEquip?: AssetQuantityInput[];
    sellLoot?: AssetQuantityInput[];
    sellPets?: AssetQuantityInput[];
    total: CoinPurse;
    isTotalPositive: boolean;
}

interface RawCity {
    _id: Types.ObjectId;
    markerLocation: Types.ObjectId;
    shopEquipment?: Types.ObjectId[];
    shopLoot?: Types.ObjectId[];
    shopPets?: Types.ObjectId[];
}

const coins = (gold: number, silver: number, copper: number): CoinPurse => ({
    gold,
    silver,
    copper,
});

const asset = (id: Types.ObjectId): AssetQuantityInput => ({
    item: id.toHexString(),
    quantity: 1,
});

const hexOf = (ids: readonly Types.ObjectId[] = []) =>
    ids.map((id) => id.toHexString());

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

function idsOf(shop: CityShopWire): string[] {
    return [...shop.equipment, ...shop.loot].map(({ item }) => item.id).sort();
}

describe('city shops end to end on a seeded world (BE-SHOP-05)', () => {
    let harness: AuthTestApp;
    let models: ShopWorldModels;
    let characters: Model<any>;
    let catalogue: Awaited<ReturnType<typeof persistShopCatalogue>>;
    let cities: Record<string, RawCity>;

    function byName(items: any[], name: string): any {
        return items.find((item) => item.name === name);
    }

    function petId(name: string): Types.ObjectId {
        return byName(catalogue.pets, name)._id as Types.ObjectId;
    }

    async function rawCities(): Promise<Record<string, RawCity>> {
        const documents = await models.city.collection.find({}).toArray();
        return Object.fromEntries(
            documents.map((city) => [city.name, city as unknown as RawCity]),
        );
    }

    function playerIn(
        twitchId: string,
        cityName: string,
        assets: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        const base = buildCharacter();
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...base.status,
                    coins: coins(0, 5, 0),
                    location: cities[cityName].markerLocation,
                },
                assets: { ...base.assets, ...assets },
            },
        });
    }

    function characterIdOf(player: TestPlayer): Types.ObjectId {
        return player.character?._id as Types.ObjectId;
    }

    function raw(player: TestPlayer) {
        return characters.collection.findOne({ _id: characterIdOf(player) });
    }

    async function send(
        document: string,
        variables: Record<string, unknown>,
        bearer: string,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            document,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    async function cityShop(
        cityName: string,
        bearer: string,
    ): Promise<CityShopWire> {
        const body = await send(
            CITY_SHOP,
            { cityId: cities[cityName]._id.toHexString() },
            bearer,
        );
        expect(body.errors).toBeUndefined();
        return body.data?.cityShop as CityShopWire;
    }

    function trade(player: TestPlayer, deal: Trade): Promise<WireBody> {
        return send(
            DO_TRANSACTION,
            {
                request: {
                    id: characterIdOf(player).toHexString(),
                    boughtItems: {
                        equipAssets: deal.buyEquip ?? [],
                        lootAssets: [],
                        petAssets: deal.buyPets ?? [],
                    },
                    soldItems: {
                        equipAssets: deal.sellEquip ?? [],
                        lootAssets: deal.sellLoot ?? [],
                        petAssets: deal.sellPets ?? [],
                    },
                    total: deal.total,
                    isTotalPositive: deal.isTotalPositive,
                },
            },
            player.bearer,
        );
    }

    function onlyInValantar(): Types.ObjectId {
        const fineglen = new Set(hexOf(cities.Fineglen.shopEquipment));
        const id = (cities.Valantar.shopEquipment ?? []).find(
            (candidate) => !fineglen.has(candidate.toHexString()),
        );
        if (!id)
            throw new Error('Valantar shares its whole pool with Fineglen');
        return id;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp({ imports: [ShopsModule] });
        models = {
            city: harness.connection.model(City.name),
            equipment: harness.connection.model(EquipmentItem.name),
            loot: harness.connection.model(LootItem.name),
            pet: harness.connection.model(Pet.name),
        };
        characters = harness.connection.model(Character.name);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([
            characters.init(),
            models.city.init(),
            models.equipment.init(),
            models.loot.init(),
            models.pet.init(),
        ]);
    });

    beforeEach(async () => {
        catalogue = await persistShopCatalogue(models);
        await persistShopCities(models.city);
        // il modulo di manutenzione non è negli harness (D-24): la semina si chiama a mano
        await new ShopPoolSeeder(
            models.city as never,
            models.equipment as never,
            models.loot as never,
            models.pet as never,
        ).seedAll();
        cities = await rawCities();
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('seeds a village, a city and a capital with three different pools (D-03, D-08)', async () => {
        const { bearer } = await createPlayer(harness, {
            twitchId: 'twitch-e2e-pools',
            withCharacter: false,
        });

        const village = await cityShop('Fineglen', bearer);
        const city = await cityShop('Porto Saldo', bearer);
        const capital = await cityShop('Valantar', bearer);

        expect(
            [village, city, capital].map((shop) => [
                shop.city.hasShop,
                shop.equipment.length,
                shop.loot.length,
            ]),
        ).toEqual([
            [true, 10, 12],
            [true, 16, 18],
            [true, 24, 24],
        ]);
        expect(idsOf(village)).not.toEqual(idsOf(city));
        expect(idsOf(city)).not.toEqual(idsOf(capital));
        expect(idsOf(village)).not.toEqual(idsOf(capital));
        const rarities = [village, city, capital].flatMap((shop) =>
            [...shop.equipment, ...shop.loot].map(({ item }) => item.rarity),
        );
        expect(rarities).not.toContain('legendary');
    });

    it('refuses a purchase outside the pool of the city without writes (D-19)', async () => {
        const player = await playerIn('twitch-e2e-outside', 'Fineglen');
        const before = await raw(player);

        const body = await trade(player, {
            buyEquip: [asset(onlyInValantar())],
            total: coins(0, 1, 50),
            isTotalPositive: false,
        });

        expect(body.data?.doTransaction ?? null).toBeNull();
        expect(codeOf(body)).toBe('ITEM_NOT_IN_SHOP');
        expect(await raw(player)).toEqual(before);
    });

    it('refuses a duplicate pet without writes (D-14)', async () => {
        const horse = petId('Cavallo da viaggio');
        const player = await playerIn('twitch-e2e-duplicate', 'Talmvere', {
            ownedPets: [horse],
        });
        const before = await raw(player);

        const body = await trade(player, {
            buyPets: [asset(horse)],
            total: coins(0, 1, 0),
            isTotalPositive: false,
        });

        expect(body.data?.doTransaction ?? null).toBeNull();
        expect(codeOf(body)).toBe('PET_ALREADY_OWNED');
        expect(await raw(player)).toEqual(before);
    });

    it('sells outside the pool and sells an owned legendary (D-11, D-12)', async () => {
        const fineglenLoot = new Set(hexOf(cities.Fineglen.shopLoot));
        const foreignLoot = catalogue.loot.find(
            (item) => !fineglenLoot.has(item._id.toHexString()),
        )._id as Types.ObjectId;
        const legendary = byName(catalogue.equipment, 'Equip legendary 01')
            ._id as Types.ObjectId;
        const player = await playerIn('twitch-e2e-sell', 'Fineglen', {
            ownedItems: [
                { itemType: 'LootItem', item: foreignLoot, quantity: 1 },
            ],
            ownedEquipments: [
                { itemType: 'EquipmentItem', item: legendary, quantity: 1 },
            ],
        });

        const body = await trade(player, {
            sellEquip: [asset(legendary)],
            sellLoot: [asset(foreignLoot)],
            total: coins(0, 0, 85),
            isTotalPositive: true,
        });

        expect(body.errors).toBeUndefined();
        expect(body.data?.doTransaction).toEqual(SUCCESS);
        const after = await raw(player);
        expect(after?.status.coins).toEqual(coins(0, 5, 85));
        expect(after?.assets.ownedItems).toEqual([]);
        expect(after?.assets.ownedEquipments).toEqual([]);
    });

    it('buys a companion, equips it and sells it elsewhere emptying the slot (D-13, D-15, D-14)', async () => {
        const horse = petId('Cavallo da viaggio');
        const player = await playerIn('twitch-e2e-companion', 'Talmvere');

        const bought = await trade(player, {
            buyPets: [asset(horse)],
            total: coins(0, 1, 0),
            isTotalPositive: false,
        });

        expect(bought.errors).toBeUndefined();
        const afterBuy = await raw(player);
        expect(afterBuy?.assets.ownedPets).toEqual([horse]);
        expect(afterBuy?.assets.pet).toBeNull();

        const equipped = await send(
            EQUIP_PET,
            {
                request: {
                    id: characterIdOf(player).toHexString(),
                    petId: horse.toHexString(),
                },
            },
            player.bearer,
        );

        expect(equipped.data?.equipPet).toEqual({ successful: true });
        expect((await raw(player))?.assets.pet).toEqual(horse);

        expect(cities['Porto Saldo'].shopPets).toEqual([]);
        await characters.collection.updateOne({ _id: characterIdOf(player) }, {
            $set: {
                'status.location': cities['Porto Saldo'].markerLocation,
            },
        } as never);
        const sold = await trade(player, {
            sellPets: [asset(horse)],
            total: coins(0, 0, 50),
            isTotalPositive: true,
        });

        expect(sold.errors).toBeUndefined();
        expect(sold.data?.doTransaction).toEqual(SUCCESS);
        const afterSell = await raw(player);
        expect(afterSell?.assets.ownedPets).toEqual([]);
        expect(afterSell?.assets.pet).toBeNull();
        expect(afterSell?.status.coins).toEqual(coins(0, 4, 50));
    });

    it('keeps Necrorian closed (D-04)', async () => {
        const player = await playerIn('twitch-e2e-necrorian', 'Necrorian');

        const shop = await cityShop('Necrorian', player.bearer);
        const body = await trade(player, {
            buyEquip: [asset(onlyInValantar())],
            total: coins(0, 1, 50),
            isTotalPositive: false,
        });

        expect(shop).toEqual({
            city: { name: 'Necrorian', hasShop: false },
            equipment: [],
            loot: [],
            pets: [],
        });
        expect(codeOf(body)).toBe('ITEM_NOT_IN_SHOP');
    });
});
