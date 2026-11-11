import { MongooseModule } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { City } from 'src/models/city.model';
import { CityType } from 'src/models/enums/city-type.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { persistCity } from '../../test/fixtures/city.fixture';
import { persistLore } from '../../test/fixtures/lore.fixture';
import { persistPoi } from '../../test/fixtures/poi.fixture';
import { playerKnowing } from '../../test/lore/lore-world';
import { CitiesModule } from './cities.module';

const CITIES = '{ cities { id name size hasShop } }';
const CITY_WITH_POINTS =
    'query($id: String!) { city(id: $id) { name pointsOfInterest { id type location } } }';
const CITY = 'query($id: String!) { city(id: $id) { id size hasShop } }';
// selezione FE verbatim (lib/graphql/queries/city_queries.dart)
const CITIES_FE = `query cities {
    cities { id type name size hasShop markerLocation { id location } relatedLore { id description imagePath } }
}`;

interface WireCityLore {
    name: string;
    relatedLore: {
        id: string;
        description: string;
        imagePath: string | null;
    } | null;
}

interface WireCity {
    id: string;
    name?: string;
    size: string;
    hasShop: boolean;
}

describe('CitiesResolver size and hasShop', () => {
    let harness: AuthTestApp;
    let cities: Model<any>;
    let pointsOfInterest: Model<any>;
    let bearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                CitiesModule,
                MongooseModule.forFeature([
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                    { name: Lore.name, schema: LoreSchema },
                ]),
            ],
        });
        cities = harness.connection.model(City.name);
        pointsOfInterest = harness.connection.model(PointOfInterest.name);
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-cities-size',
            withCharacter: false,
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function persist(overrides: Record<string, unknown>) {
        return persistCity(cities, overrides, pointsOfInterest);
    }

    async function queryCities(): Promise<WireCity[]> {
        const response = await graphqlRequest(
            harness.app,
            CITIES,
            undefined,
            bearer,
        ).expect(200);
        expect(response.body.errors).toBeUndefined();
        return response.body.data.cities;
    }

    function byName(list: WireCity[]): Record<string, Omit<WireCity, 'id'>> {
        return Object.fromEntries(
            list.map(({ name, size, hasShop }) => [name, { size, hasShop }]),
        );
    }

    it('serves the size derived from the CityType with cities (D-01, D-02)', async () => {
        await persist({ type: CityType.valanVillage, name: 'Villaggio' });
        await persist({ type: CityType.drusteaSeaCity, name: 'Porto' });
        await persist({ type: CityType.elfCapital, name: 'Ko Shaeras' });

        expect(byName(await queryCities())).toEqual({
            Villaggio: { size: 'village', hasShop: false },
            Porto: { size: 'city', hasShop: false },
            'Ko Shaeras': { size: 'capital', hasShop: false },
        });
    });

    it('serves hasShop true when one pool list has an item (D-04)', async () => {
        await persist({
            type: CityType.drusteaCity,
            name: 'Mercato',
            shop: { loot: [new Types.ObjectId()] },
        });

        expect(byName(await queryCities())).toEqual({
            Mercato: { size: 'city', hasShop: true },
        });
    });

    it('serves hasShop false for an explicit empty pool and for a city without a pool (D-04)', async () => {
        await persist({
            type: CityType.necrorianCity,
            name: 'Necrorian',
            shop: { equipment: [], loot: [], pets: [] },
        });
        await persist({ type: CityType.mirwaCity, name: 'Senza pool' });

        expect(byName(await queryCities())).toEqual({
            Necrorian: { size: 'capital', hasShop: false },
            'Senza pool': { size: 'city', hasShop: false },
        });
    });

    it('serves size and hasShop with city (D-23)', async () => {
        const city = await persist({
            type: CityType.talmvereVillage,
            name: 'Talmvere',
            shop: { pets: [new Types.ObjectId()] },
        });

        const response = await graphqlRequest(
            harness.app,
            CITY,
            { id: city._id.toString() },
            bearer,
        ).expect(200);

        expect(response.body).toEqual({
            data: {
                city: {
                    id: city._id.toString(),
                    size: 'village',
                    hasShop: true,
                },
            },
        });
    });

    it('serves the points of interest of a city without the quest back link (D-09)', async () => {
        const ruins = await persistPoi(pointsOfInterest, {
            type: ['ruins'],
            location: [12.5, 41.9],
        });
        const city = await persist({
            name: 'Con rovine',
            pointsOfInterest: [ruins._id],
        });

        const response = await graphqlRequest(
            harness.app,
            CITY_WITH_POINTS,
            { id: city._id.toString() },
            bearer,
        ).expect(200);

        expect(response.body).toEqual({
            data: {
                city: {
                    name: 'Con rovine',
                    pointsOfInterest: [
                        {
                            id: ruins._id.toString(),
                            type: ['ruins'],
                            location: [12.5, 41.9],
                        },
                    ],
                },
            },
        });
    });

    async function cityLoreOnWire(
        auth: string,
    ): Promise<Record<string, unknown>> {
        const response = await graphqlRequest(
            harness.app,
            CITIES_FE,
            undefined,
            auth,
        ).expect(200);
        expect(response.body.errors).toBeUndefined();
        return Object.fromEntries(
            (response.body.data.cities as WireCityLore[]).map((city) => [
                city.name,
                city.relatedLore,
            ]),
        );
    }

    async function innkeeperBearer(): Promise<string> {
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-cities-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        return innkeeper.bearer;
    }

    it('hides the city lore until the player knows the city (D-10)', async () => {
        const lores = harness.connection.model(Lore.name);
        const knownLore = await persistLore(lores, {
            type: 'city',
            name: 'Drustea',
            description: 'La città del porto.',
            imagePath: 'https://cdn.test/drustea.png',
        });
        const lockedLore = await persistLore(lores, {
            type: 'city',
            name: 'Valantar',
            description: 'La capitale chiusa.',
        });
        await persist({ name: 'Drustea', relatedLore: knownLore._id });
        await persist({ name: 'Valantar', relatedLore: lockedLore._id });
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-cities-traveller',
            lore: [knownLore._id],
        });
        const drustea = {
            id: knownLore._id.toHexString(),
            description: 'La città del porto.',
            imagePath: 'https://cdn.test/drustea.png',
        };

        expect(await cityLoreOnWire(player.bearer)).toEqual({
            Drustea: drustea,
            Valantar: null,
        });
        expect(await cityLoreOnWire(await innkeeperBearer())).toEqual({
            Drustea: drustea,
            Valantar: {
                id: lockedLore._id.toHexString(),
                description: 'La capitale chiusa.',
                imagePath: null,
            },
        });
    });

    it('answers null for an orphan city lore (D-10)', async () => {
        const orphan = new Types.ObjectId();
        await persist({ name: 'Orfana', relatedLore: orphan });
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-cities-orphan',
            lore: [orphan],
        });

        expect(await cityLoreOnWire(player.bearer)).toEqual({ Orfana: null });
        expect(await cityLoreOnWire(await innkeeperBearer())).toEqual({
            Orfana: null,
        });
    });
});
