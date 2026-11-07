import { Model, Types } from 'mongoose';
import { City, CitySchema } from 'src/models/city.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { buildCity, persistCity, persistPoi } from '../../test/fixtures';
import { persistGeography } from '../../test/lore/lore-world';
import { LoreGeographyModule } from './lore-geography.module';
import { LoreGeographyReader } from './lore-geography.reader';

describe('LoreGeographyReader', () => {
    let harness: AuthTestApp;
    let reader: LoreGeographyReader;
    let cities: Model<any>;
    let lores: Model<any>;
    let pois: Model<any>;

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [LoreGeographyModule] });
        reader = harness.app.get(LoreGeographyReader);
        cities =
            harness.connection.models[City.name] ??
            harness.connection.model(City.name, CitySchema);
        lores =
            harness.connection.models[Lore.name] ??
            harness.connection.model(Lore.name, LoreSchema);
        pois =
            harness.connection.models[PointOfInterest.name] ??
            harness.connection.model(
                PointOfInterest.name,
                PointOfInterestSchema,
            );
        await Promise.all([cities.init(), lores.init(), pois.init()]);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('reads the city lore with its regions and its state (D-03)', async () => {
        const world = await persistGeography(harness.connection, {
            regions: 2,
        });

        expect(await reader.ofMarker(world.marker)).toEqual(world.geography);
    });

    it('opens nothing on a territory point of interest (D-05)', async () => {
        const world = await persistGeography(harness.connection);
        const territory = await persistPoi(pois, { type: 'dungeon' });
        const listed = await persistPoi(pois, { city: world.city._id });
        await cities.updateOne(
            { _id: world.city._id },
            { pointsOfInterest: [listed._id] },
        );

        expect(await reader.ofMarker(territory._id)).toEqual([]);
        expect(await reader.ofMarker(listed._id)).toEqual([]);
    });

    it('finds the city of a legacy string marker (D-05, Pitfall 8)', async () => {
        const world = await persistGeography(harness.connection, {
            regions: 2,
        });
        await cities.collection.updateOne(
            { _id: world.city._id },
            { $set: { markerLocation: world.marker.toHexString() } },
        );

        expect(await reader.ofMarker(world.marker)).toEqual(world.geography);
    });

    it('opens nothing for a city without lore or with an orphan lore (D-05)', async () => {
        const withoutLore = await persistCity(
            cities,
            { name: 'Senza lore', relatedLore: null },
            pois,
        );
        const withOrphan = await persistCity(
            cities,
            { name: 'Lore orfana', relatedLore: new Types.ObjectId() },
            pois,
        );

        expect(await reader.ofMarker(withoutLore.markerLocation)).toEqual([]);
        expect(await reader.ofMarker(withOrphan.markerLocation)).toEqual([]);
    });

    it('drops an orphan region and keeps the rest (D-03)', async () => {
        const world = await persistGeography(harness.connection, {
            regions: 2,
        });
        const [first, ...rest] = world.cityLore.relatedLore as unknown[];
        await lores.updateOne(
            { _id: world.cityLore._id },
            { relatedLore: [first, new Types.ObjectId(), ...rest] },
        );

        expect(await reader.ofMarker(world.marker)).toEqual(world.geography);
    });

    it('answers nothing for a missing marker (D-05)', async () => {
        await persistGeography(harness.connection);

        expect(await reader.ofMarker(null)).toEqual([]);
    });

    it('reads inside the given session (D-05)', async () => {
        const world = await persistGeography(harness.connection);
        const marker = new Types.ObjectId();

        const [inside, outside] = await harness.connection.transaction(
            async (session) => {
                await cities.create(
                    [
                        buildCity({
                            name: 'Nella sessione',
                            markerLocation: marker,
                            relatedLore: world.cityLore._id,
                        }),
                    ],
                    { session },
                );
                return [
                    await reader.ofMarker(marker, session),
                    await reader.ofMarker(marker),
                ];
            },
        );

        expect(inside).toEqual([world.cityLore._id]);
        expect(outside).toEqual([]);
    });
});
