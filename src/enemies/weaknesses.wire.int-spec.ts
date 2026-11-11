import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { buildEnemy, persistEnemy } from '../../test/fixtures';
import { EnemiesModule } from './enemies.module';

const ENEMIES = 'query { enemys { id weaknesses { base energy } } }';
const ENEMY =
    'query Enemy($id: String!) { enemy(id: $id) { id weaknesses { base energy } } }';

interface WireEnemy {
    id: string;
    weaknesses: { base: string[]; energy: string[] };
}

interface WireBody {
    data?: { enemys?: WireEnemy[]; enemy?: WireEnemy } | null;
    errors?: { message: string }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('enemy weaknesses (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;
    let enemies: Model<any>;

    // il contenuto lo scrive uno script col driver nativo, senza i validatori dello schema
    async function insertEnemyWith(weaknesses: unknown): Promise<string> {
        const { insertedId } = await enemies.collection.insertOne(
            buildEnemy({ name: 'Spettro', weaknesses }),
        );
        return String(insertedId);
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [EnemiesModule] });
        enemies =
            harness.connection.models[Enemy.name] ??
            harness.connection.model(Enemy.name, EnemySchema);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        bearer = (
            await createPlayer(harness, { twitchId: 'twitch-weakness-reader' })
        ).bearer;
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves the weaknesses of the two enums as stored (D-01)', async () => {
        const wolf = (await persistEnemy(enemies, {
            weaknesses: { base: ['cut', 'pierce'], energy: ['fire'] },
        })) as { _id: Types.ObjectId };

        const body = bodyOf(
            await graphqlRequest(harness.app, ENEMIES, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.enemys).toEqual([
            {
                id: String(wolf._id),
                weaknesses: { base: ['cut', 'pierce'], energy: ['fire'] },
            },
        ]);
    });

    it('drops a weakness stored outside the enum instead of nulling the enemies list (D-01)', async () => {
        const wolf = (await persistEnemy(enemies, {
            weaknesses: { base: ['cut'], energy: [] },
        })) as { _id: Types.ObjectId };
        const ghost = await insertEnemyWith({
            base: ['cut', 'tickle'],
            energy: ['moonlight', 'fire'],
        });

        const body = bodyOf(
            await graphqlRequest(harness.app, ENEMIES, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(
            [...(body.data?.enemys ?? [])].sort((a, b) =>
                a.id.localeCompare(b.id),
            ),
        ).toEqual(
            [
                {
                    id: String(wolf._id),
                    weaknesses: { base: ['cut'], energy: [] },
                },
                { id: ghost, weaknesses: { base: ['cut'], energy: ['fire'] } },
            ].sort((a, b) => a.id.localeCompare(b.id)),
        );
    });

    it('drops a weakness stored outside the enum on a single enemy (D-01)', async () => {
        const ghost = await insertEnemyWith({
            base: ['tickle'],
            energy: ['fire', 'moonlight'],
        });

        const body = bodyOf(
            await graphqlRequest(harness.app, ENEMY, { id: ghost }, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.enemy).toEqual({
            id: ghost,
            weaknesses: { base: [], energy: ['fire'] },
        });
    });

    it('serves empty lists for weaknesses stored as null (D-01)', async () => {
        const ghost = await insertEnemyWith({ base: null, energy: null });

        const body = bodyOf(
            await graphqlRequest(harness.app, ENEMY, { id: ghost }, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.enemy).toEqual({
            id: ghost,
            weaknesses: { base: [], energy: [] },
        });
    });
});
