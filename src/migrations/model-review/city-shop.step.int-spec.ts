// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo del pool dei negozi con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { City, CitySchema } from 'src/models/city.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { CityShopStep } from './city-shop.step';
import {
    insertLegacy,
    legacyCity,
    rawById,
    type LegacyCityPool,
} from './legacy-fixtures';

const CITY_KEYS = [
    '_id',
    'area',
    'markerLocation',
    'name',
    'pointsOfInterest',
    'relatedLore',
    'type',
];

describe('CityShopStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: CityShopStep;

    const insertCity = (pool: LegacyCityPool = {}): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, City.name, legacyCity(pool));

    const rawCity = async (id: Types.ObjectId) =>
        (await rawById(harness.connection, City.name, id)) ?? {};

    const ids = (count: number) =>
        Array.from({ length: count }, () => new Types.ObjectId());

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: City.name, schema: CitySchema },
                ]),
            ],
            providers: [CityShopStep],
        });
        step = harness.app.get(CityShopStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('moves the three pool lists under the shop sub-document as they are (D-10)', async () => {
        const pool = { equipment: ids(3), loot: ids(2), pets: ids(2) };
        const id = await insertCity(pool);
        const before = untouchedFieldsOf(await rawCity(id));

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const after = await rawCity(id);
        expect(Object.keys(after).sort()).toEqual(
            [...CITY_KEYS, 'shop'].sort(),
        );
        expect(after).toEqual({ ...before, shop: pool });
    });

    it('keeps an empty pool list empty (D-10)', async () => {
        const pool = { equipment: ids(2), loot: [], pets: ids(1) };
        const id = await insertCity(pool);

        await step.run();

        expect((await rawCity(id)).shop).toEqual(pool);
    });

    it('leaves a city without a pool without the sub-document (D-10)', async () => {
        const id = await insertCity();
        const before = await rawCity(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 1,
            unmatched: 0,
        });

        const after = await rawCity(id);
        expect(Object.keys(after).sort()).toEqual(CITY_KEYS);
        expect(after).toEqual(before);
    });

    it('moves a city that has only some of the three lists (D-10)', async () => {
        const pool = { equipment: ids(1), pets: [] };
        const id = await insertCity(pool);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const after = await rawCity(id);
        expect(Object.keys(after).sort()).toEqual(
            [...CITY_KEYS, 'shop'].sort(),
        );
        expect(after.shop).toEqual(pool);
    });

    it('changes nothing on a second run (D-10)', async () => {
        const cities = [
            await insertCity({ equipment: ids(2), loot: ids(1), pets: [] }),
            await insertCity({ equipment: [], loot: [], pets: [] }),
            await insertCity({ loot: ids(1) }),
            await insertCity(),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(cities.map(rawCity));

        await expect(step.run()).resolves.toEqual({
            found: 4,
            migrated: 0,
            alreadyDone: 4,
            unmatched: 0,
        });

        expect(await Promise.all(cities.map(rawCity))).toEqual(afterFirstRun);
    });

    it('reports zero on an empty collection (D-12)', async () => {
        await expect(step.run()).resolves.toEqual({
            found: 0,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 0,
        });
    });
});

// i campi della città che il passo non deve toccare
function untouchedFieldsOf(city: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(city).filter(([key]) => CITY_KEYS.includes(key)),
    );
}
