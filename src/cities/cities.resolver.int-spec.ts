import { MongooseModule } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { City } from 'src/models/city.model';
import { CityType } from 'src/models/enums/city-type.enum';
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
import { CitiesModule } from './cities.module';

const CITIES = '{ cities { id name size hasShop } }';
const CITY = 'query($id: String!) { city(id: $id) { id size hasShop } }';

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
            shopLoot: [new Types.ObjectId()],
        });

        expect(byName(await queryCities())).toEqual({
            Mercato: { size: 'city', hasShop: true },
        });
    });

    it('serves hasShop false for an explicit empty pool and for an unseeded city (D-04)', async () => {
        await persist({
            type: CityType.necrorianCity,
            name: 'Necrorian',
            shopEquipment: [],
            shopLoot: [],
            shopPets: [],
        });
        await persist({ type: CityType.mirwaCity, name: 'Non seminata' });

        expect(byName(await queryCities())).toEqual({
            Necrorian: { size: 'city', hasShop: false },
            'Non seminata': { size: 'city', hasShop: false },
        });
    });

    it('serves size and hasShop with city (D-23)', async () => {
        const city = await persist({
            type: CityType.talmvereVillage,
            name: 'Talmvere',
            shopPets: [new Types.ObjectId()],
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
});
