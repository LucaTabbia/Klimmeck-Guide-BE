import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { persistEnemy, persistLore } from '../../test/fixtures';
import { LoreModule } from './lore.module';

// selezione FE verbatim (lib/graphql/queries/lore_queries.dart)
const LORES =
    'query { lores { id image type name description relatedLore { id name } } }';
const LORE =
    'query Lore($id: String!) { lore(id: $id) { id relatedLore { id name } } }';
const ENEMIES = 'query { enemys { id name relatedLore { id name } } }';
const ENEMY =
    'query Enemy($id: String!) { enemy(id: $id) { id name relatedLore { id name } } }';

interface WireRelated {
    id: string;
    name: string;
}

interface WireWithRelated {
    id: string;
    relatedLore: WireRelated[];
}

interface WireBody {
    data?: {
        lores?: WireWithRelated[];
        lore?: WireWithRelated;
        enemys?: WireWithRelated[];
        enemy?: WireWithRelated;
    } | null;
    errors?: { message: string }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('related lore (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;
    let loreModel: Model<any>;
    let loreA: { _id: Types.ObjectId };
    let loreB: { _id: Types.ObjectId };

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    async function request(query: string, variables?: Record<string, unknown>) {
        return bodyOf(
            await graphqlRequest(harness.app, query, variables, bearer),
        );
    }

    function relatedOf(
        entries: WireWithRelated[] | undefined,
        id: Types.ObjectId,
    ): WireRelated[] | undefined {
        return entries?.find((entry) => entry.id === String(id))?.relatedLore;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [LoreModule, EnemiesModule],
        });
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-lore-reader',
        }));
        loreModel = modelOf(Lore.name, LoreSchema);
        loreA = await persistLore(loreModel, { name: 'A' });
        loreB = await persistLore(loreModel, {
            name: 'B',
            relatedLore: [loreA._id],
        });
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves the related lore of every lore in the list (11 Pitfall 1)', async () => {
        await loreModel.updateOne(
            { _id: loreA._id },
            { relatedLore: [loreB._id] },
        );

        const body = await request(LORES);

        expect(body.errors).toBeUndefined();
        expect(relatedOf(body.data?.lores, loreA._id)).toEqual([
            { id: String(loreB._id), name: 'B' },
        ]);
        expect(relatedOf(body.data?.lores, loreB._id)).toEqual([
            { id: String(loreA._id), name: 'A' },
        ]);
    });

    it('drops a related lore that no longer exists instead of failing the list', async () => {
        await loreModel.updateOne(
            { _id: loreA._id },
            { relatedLore: [loreB._id, new Types.ObjectId()] },
        );

        const body = await request(LORES);

        expect(body.errors).toBeUndefined();
        expect(relatedOf(body.data?.lores, loreA._id)).toEqual([
            { id: String(loreB._id), name: 'B' },
        ]);
    });

    it('serves the related lore of a single lore', async () => {
        await loreModel.updateOne(
            { _id: loreA._id },
            { relatedLore: [loreB._id, new Types.ObjectId()] },
        );

        const body = await request(LORE, { id: String(loreA._id) });

        expect(body.errors).toBeUndefined();
        expect(body.data?.lore?.relatedLore).toEqual([
            { id: String(loreB._id), name: 'B' },
        ]);
    });

    it('serves the related lore of every enemy', async () => {
        const enemy = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
            relatedLore: [loreA._id, new Types.ObjectId()],
        });
        const expected = [{ id: String(loreA._id), name: 'A' }];

        const list = await request(ENEMIES);
        const single = await request(ENEMY, { id: String(enemy._id) });

        expect(list.errors).toBeUndefined();
        expect(relatedOf(list.data?.enemys, enemy._id)).toEqual(expected);
        expect(single.errors).toBeUndefined();
        expect(single.data?.enemy?.relatedLore).toEqual(expected);
    });
});
