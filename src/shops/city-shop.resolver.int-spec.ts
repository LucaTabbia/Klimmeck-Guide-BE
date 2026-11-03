import { MongooseModule } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { City } from 'src/models/city.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import {
    persistCity,
    persistEquipmentItem,
    persistLore,
    persistSpell,
} from '../../test/fixtures';
import {
    persistShopCatalogue,
    ShopWorldModels,
} from '../../test/shops/shop-world.fixture';
import { ShopsModule } from './shops.module';

const MISSING_CITY_ID = '64b0000000000000000000ff';
const MALFORMED_ID = 'abc';
const CITY_SHOP = `query CityShop($cityId: ID!) {
    cityShop(cityId: $cityId) {
        city { id name size hasShop }
        equipment { quantity item { ... on EquipmentItem { id name rarity sellable addedSpell { id } } } }
        loot { quantity item { ... on LootItem { id name effect } } }
        pets { id name buyPrice { gold silver copper } sellPrice { gold silver copper } speedModifier sellable }
    }
}`;
const CITY_SHOP_RELATIONS = `query CityShopRelations($cityId: ID!) {
    cityShop(cityId: $cityId) {
        city { markerLocation { id } relatedLore { id } pointsOfInterest { id } }
    }
}`;

interface WireBody {
    data?: { cityShop?: Record<string, unknown> | null } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

describe('cityShop', () => {
    let harness: AuthTestApp;
    let models: ShopWorldModels;
    let spells: Model<any>;
    let pointsOfInterest: Model<any>;
    let lores: Model<any>;
    let bearer: string;
    let catalogue: Awaited<ReturnType<typeof persistShopCatalogue>>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                ShopsModule,
                MongooseModule.forFeature([
                    { name: Spell.name, schema: SpellSchema },
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                    { name: Lore.name, schema: LoreSchema },
                    { name: Quest.name, schema: QuestSchema },
                ]),
            ],
        });
        models = {
            city: harness.connection.model(City.name),
            equipment: harness.connection.model(EquipmentItem.name),
            loot: harness.connection.model(LootItem.name),
            pet: harness.connection.model(Pet.name),
        };
        spells = harness.connection.model(Spell.name);
        pointsOfInterest = harness.connection.model(PointOfInterest.name);
        lores = harness.connection.model(Lore.name);
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-city-shop',
            withCharacter: false,
        }));
        catalogue = await persistShopCatalogue(models);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function byName(items: any[], name: string): any {
        return items.find((item) => item.name === name);
    }

    async function cityShopOnWire(
        cityId: string,
        auth: string | undefined = bearer,
        query: string = CITY_SHOP,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            query,
            { cityId },
            auth,
        );
        return response.body as WireBody;
    }

    it('serves the FE contract of cityShop to an authenticated player (D-18)', async () => {
        const spell = await persistSpell(spells, { name: 'Palla di fuoco' });
        const staff = await persistEquipmentItem(models.equipment, {
            name: 'Bastone del mago',
            sellable: true,
            addedSpell: spell._id,
        });
        const rare = byName(catalogue.equipment, 'Equip rare 01');
        const heal = byName(catalogue.loot, 'Loot common heal 01');
        const horse = byName(catalogue.pets, 'Cavallo leggero');
        const city = await persistCity(
            models.city,
            {
                name: 'Valantar',
                type: 'valanCapital',
                shopEquipment: [rare._id, staff._id],
                shopLoot: [heal._id],
                shopPets: [horse._id],
            },
            pointsOfInterest,
        );

        const body = await cityShopOnWire(city._id.toHexString());

        expect(body.errors).toBeUndefined();
        expect(body.data).toEqual({
            cityShop: {
                city: {
                    id: city._id.toHexString(),
                    name: 'Valantar',
                    size: 'capital',
                    hasShop: true,
                },
                equipment: [
                    {
                        quantity: 1,
                        item: {
                            id: rare._id.toHexString(),
                            name: 'Equip rare 01',
                            rarity: 'rare',
                            sellable: null,
                            addedSpell: null,
                        },
                    },
                    {
                        quantity: 1,
                        item: {
                            id: staff._id.toHexString(),
                            name: 'Bastone del mago',
                            rarity: 'common',
                            sellable: true,
                            addedSpell: { id: spell._id.toHexString() },
                        },
                    },
                ],
                loot: [
                    {
                        quantity: 1,
                        item: {
                            id: heal._id.toHexString(),
                            name: 'Loot common heal 01',
                            effect: 'heal',
                        },
                    },
                ],
                pets: [
                    {
                        id: horse._id.toHexString(),
                        name: 'Cavallo leggero',
                        buyPrice: { gold: 0, silver: 1, copper: 0 },
                        sellPrice: { gold: 0, silver: 0, copper: 50 },
                        speedModifier: 2.5,
                        sellable: true,
                    },
                ],
            },
        });
    });

    it('resolves the marker, the lore and the points of interest of the shop city (D-18)', async () => {
        const lore = await persistLore(lores, { name: 'Storia di Valantar' });
        const city = await persistCity(
            models.city,
            {
                name: 'Valantar',
                type: 'valanCapital',
                relatedLore: lore._id,
                shopEquipment: [],
                shopLoot: [],
                shopPets: [],
            },
            pointsOfInterest,
        );
        await models.city.updateOne(
            { _id: city._id },
            { pointsOfInterest: [city.markerLocation] },
        );

        const body = await cityShopOnWire(
            city._id.toHexString(),
            bearer,
            CITY_SHOP_RELATIONS,
        );

        expect(body).toEqual({
            data: {
                cityShop: {
                    city: {
                        markerLocation: {
                            id: city.markerLocation.toHexString(),
                        },
                        relatedLore: { id: lore._id.toHexString() },
                        pointsOfInterest: [
                            { id: city.markerLocation.toHexString() },
                        ],
                    },
                },
            },
        });
    });

    it('serves Necrorian closed with empty lists (D-04)', async () => {
        const city = await persistCity(
            models.city,
            {
                name: 'Necrorian',
                type: 'necrorianCity',
                shopEquipment: [],
                shopLoot: [],
                shopPets: [],
            },
            pointsOfInterest,
        );

        const body = await cityShopOnWire(city._id.toHexString());

        expect(body.data).toEqual({
            cityShop: {
                city: {
                    id: city._id.toHexString(),
                    name: 'Necrorian',
                    size: 'city',
                    hasShop: false,
                },
                equipment: [],
                loot: [],
                pets: [],
            },
        });
    });

    it('answers BAD_USER_INPUT on a malformed city id and NOT_FOUND on an unknown one (D-18)', async () => {
        const [malformed, unknown] = await Promise.all([
            cityShopOnWire(MALFORMED_ID),
            cityShopOnWire(MISSING_CITY_ID),
        ]);

        expect(
            [malformed, unknown].map(({ data, errors }) => ({
                data: data ?? null,
                code: errors?.[0]?.extensions.code,
            })),
        ).toEqual([
            { data: null, code: 'BAD_USER_INPUT' },
            { data: null, code: 'NOT_FOUND' },
        ]);
    });

    it('refuses an anonymous request (D-18)', async () => {
        const body = await cityShopOnWire(MISSING_CITY_ID, '');

        expect(body.errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });
});
