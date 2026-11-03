import { MongooseModule } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { City } from 'src/models/city.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { persistCity } from '../../test/fixtures';
import {
    persistShopCatalogue,
    ShopWorldModels,
} from '../../test/shops/shop-world.fixture';
import { ShopsModule } from './shops.module';

const SHOP_POOL_REPORT = `query ShopPoolReport {
    shopPoolReport {
        cityId cityName size emptyPool missing
        outOfSize { id name rarity }
        vetoed { id name rarity }
    }
}`;

interface WireBody {
    data?: { shopPoolReport?: Record<string, unknown>[] | null } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

describe('shopPoolReport', () => {
    let harness: AuthTestApp;
    let models: ShopWorldModels;
    let pointsOfInterest: Model<any>;
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
                ]),
            ],
        });
        models = {
            city: harness.connection.model(City.name),
            equipment: harness.connection.model(EquipmentItem.name),
            loot: harness.connection.model(LootItem.name),
            pet: harness.connection.model(Pet.name),
        };
        pointsOfInterest = harness.connection.model(PointOfInterest.name);
    });

    beforeEach(async () => {
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

    async function bearerOf(role: RoleType): Promise<string> {
        const { bearer } = await createPlayer(harness, {
            twitchId: `twitch-shop-report-${role}`,
            role,
            withCharacter: false,
        });
        return bearer;
    }

    async function reportOnWire(bearer: string): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            SHOP_POOL_REPORT,
            {},
            bearer,
        );
        return response.body as WireBody;
    }

    function persistShopCity(
        name: string,
        type: string,
        pools: Record<string, unknown[]>,
    ) {
        return persistCity(
            models.city,
            {
                name,
                type,
                shopEquipment: [],
                shopLoot: [],
                shopPets: [],
                ...pools,
            },
            pointsOfInterest,
        );
    }

    async function persistRuleAbidingCity() {
        return persistShopCity('Valantar', 'valanCapital', {
            shopEquipment: [byName(catalogue.equipment, 'Equip rare 01')._id],
            shopLoot: [byName(catalogue.loot, 'Loot common heal 01')._id],
            shopPets: [byName(catalogue.pets, 'Cavallo leggero')._id],
        });
    }

    it('lets the innkeeper read the pools out of the rules (D-06)', async () => {
        const common = byName(catalogue.equipment, 'Equip common 01');
        const ultrarare = byName(catalogue.equipment, 'Equip ultrarare 01');
        const legendary = byName(catalogue.equipment, 'Equip legendary 01');
        const village = await persistShopCity('Fineglen', 'valanVillage', {
            shopEquipment: [common._id, ultrarare._id, legendary._id],
        });
        const city = await persistShopCity('Porto Saldo', 'drusteaSeaCity', {});
        await persistShopCity('Necrorian', 'necrorianCity', {});
        await persistRuleAbidingCity();

        const body = await reportOnWire(await bearerOf(RoleType.innkeeper));

        expect(body.errors).toBeUndefined();
        expect(body.data).toEqual({
            shopPoolReport: [
                {
                    cityId: village._id.toHexString(),
                    cityName: 'Fineglen',
                    size: 'village',
                    emptyPool: false,
                    missing: [],
                    outOfSize: [
                        {
                            id: ultrarare._id.toHexString(),
                            name: 'Equip ultrarare 01',
                            rarity: 'ultrarare',
                        },
                    ],
                    vetoed: [
                        {
                            id: legendary._id.toHexString(),
                            name: 'Equip legendary 01',
                            rarity: 'legendary',
                        },
                    ],
                },
                {
                    cityId: city._id.toHexString(),
                    cityName: 'Porto Saldo',
                    size: 'city',
                    emptyPool: true,
                    missing: [],
                    outOfSize: [],
                    vetoed: [],
                },
            ],
        });
    });

    it('answers an empty list when every seeded pool follows the rules (D-06)', async () => {
        await persistRuleAbidingCity();
        await persistCity(
            models.city,
            { name: 'Fineglen', type: 'valanVillage' },
            pointsOfInterest,
        );

        const body = await reportOnWire(await bearerOf(RoleType.innkeeper));

        expect(body).toEqual({ data: { shopPoolReport: [] } });
    });

    it('refuses an adventurer and a guard with FORBIDDEN (D-06)', async () => {
        await persistShopCity('Porto Saldo', 'drusteaSeaCity', {});
        const bodies = [
            await reportOnWire(await bearerOf(RoleType.adventurer)),
            await reportOnWire(await bearerOf(RoleType.guard)),
        ];

        expect(
            bodies.map(({ data, errors }) => ({
                data: data ?? null,
                extensions: errors?.[0]?.extensions,
            })),
        ).toEqual([
            { data: null, extensions: { code: 'FORBIDDEN' } },
            { data: null, extensions: { code: 'FORBIDDEN' } },
        ]);
    });

    it('never writes while reporting (D-06)', async () => {
        const ultrarare = byName(catalogue.equipment, 'Equip ultrarare 01');
        await persistShopCity('Fineglen', 'valanVillage', {
            shopEquipment: [ultrarare._id],
        });
        await persistShopCity('Porto Saldo', 'drusteaSeaCity', {});
        await persistCity(
            models.city,
            { name: 'Shadmus', type: 'desertVillage' },
            pointsOfInterest,
        );
        const rawCities = harness.connection.collection('cities');
        const before = await rawCities.find({}).sort({ _id: 1 }).toArray();

        const body = await reportOnWire(await bearerOf(RoleType.innkeeper));

        expect(body.errors).toBeUndefined();
        expect(await rawCities.find({}).sort({ _id: 1 }).toArray()).toEqual(
            before,
        );
    });
});
