import { Types } from 'mongoose';
import { PoiType } from 'src/models/enums/poi-type.enum';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { PointOfInterestModule } from './point-of-interest.module';

const TYPE_QUERY =
    'query Q($id: String!) { pointOfInterest(id: $id) { type } }';

interface WireBody {
    data?: { pointOfInterest: { type: string[] } } | null;
    errors?: unknown[];
}

describe('point of interest type (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [PointOfInterestModule] });
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-poi-type',
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function insertPointOfInterest(type: unknown): Promise<string> {
        const _id = new Types.ObjectId();
        await harness.connection
            .collection('pointsofinterest')
            .insertOne({ _id, type, location: [10, 20] });
        return _id.toHexString();
    }

    async function typeOf(id: string) {
        const response = await graphqlRequest(
            harness.app,
            TYPE_QUERY,
            { id },
            bearer,
        );
        return response.body as WireBody;
    }

    it('answers pointOfInterest { type } with a list (D-17b)', async () => {
        const legacy = await insertPointOfInterest(PoiType.city);
        const listed = await insertPointOfInterest([
            PoiType.city,
            PoiType.dungeon,
        ]);

        expect(await typeOf(legacy)).toEqual({
            data: { pointOfInterest: { type: [PoiType.city] } },
        });
        expect(await typeOf(listed)).toEqual({
            data: {
                pointOfInterest: { type: [PoiType.city, PoiType.dungeon] },
            },
        });
    });

    // la FE dell'oste chiede la città di ogni luogo per le etichette e i puntini del teletrasporto (FE Phase 21 D-29)
    it('answers pointOfInterests with the city of each place, null without one', async () => {
        const cityId = new Types.ObjectId();
        await harness.connection
            .collection('cities')
            .insertOne({ _id: cityId, name: 'Valantar' });
        const places = harness.connection.collection('pointsofinterest');
        const inner = new Types.ObjectId();
        const lonely = new Types.ObjectId();
        const orphan = new Types.ObjectId();
        await places.insertMany([
            {
                _id: inner,
                type: [PoiType.ruins],
                location: [1, 2],
                city: cityId,
            },
            { _id: lonely, type: [PoiType.ruins], location: [3, 4] },
            {
                _id: orphan,
                type: [PoiType.ruins],
                location: [5, 6],
                city: new Types.ObjectId(),
            },
        ]);

        const response = await graphqlRequest(
            harness.app,
            '{ pointOfInterests { id city { id name } } }',
            {},
            bearer,
        );

        const seeded = [inner, lonely, orphan].map((id) => id.toHexString());
        const body = response.body as {
            data: { pointOfInterests: { id: string }[] };
            errors?: unknown[];
        };
        expect(body.errors).toBeUndefined();
        expect(
            body.data.pointOfInterests.filter(({ id }) => seeded.includes(id)),
        ).toEqual([
            {
                id: inner.toHexString(),
                city: { id: cityId.toHexString(), name: 'Valantar' },
            },
            { id: lonely.toHexString(), city: null },
            { id: orphan.toHexString(), city: null },
        ]);
    });
});
