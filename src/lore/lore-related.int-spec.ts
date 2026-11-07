import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { persistEnemy, persistLore } from '../../test/fixtures';
import { playerKnowing } from '../../test/lore/lore-world';
import { LoreModule } from './lore.module';

// selezione FE verbatim (lib/graphql/queries/lore_queries.dart)
const LORES =
    'query { lores { id image type name description relatedLore { id name } } }';
const LORE =
    'query lore($id: String!) { lore(id: $id) { id image type name description relatedLore { id name } } }';
const ENEMIES = 'query { enemys { id name relatedLore { id name } } }';
const ENEMY_RELATED = 'query { enemys { id relatedLore { id } } }';
const ENEMY =
    'query Enemy($id: String!) { enemy(id: $id) { id name relatedLore { id name } } }';

interface WireRelated {
    id: string;
    name?: string;
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
    errors?: { message: string; extensions?: { code?: unknown } }[];
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
    let loreC: { _id: Types.ObjectId };

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    async function request(
        query: string,
        variables?: Record<string, unknown>,
        auth: string = bearer,
    ) {
        return bodyOf(
            await graphqlRequest(harness.app, query, variables, auth),
        );
    }

    async function innkeeperBearer(): Promise<string> {
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-lore-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        return innkeeper.bearer;
    }

    function idsOf(entries: { id: string }[] | undefined): string[] {
        return (entries ?? []).map((entry) => entry.id).sort();
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
        loreModel = modelOf(Lore.name, LoreSchema);
        loreA = await persistLore(loreModel, { name: 'A' });
        loreB = await persistLore(loreModel, {
            name: 'B',
            relatedLore: [loreA._id],
        });
        loreC = await persistLore(loreModel, { name: 'C' });
        // le lore prima del giocatore: il filtro per viewer (D-10) mostra solo quelle che conosce
        ({ bearer } = await playerKnowing(harness, {
            twitchId: 'twitch-lore-reader',
            lore: [loreA._id, loreB._id],
        }));
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves the related lore of every lore in the list (11 Pitfall 1, D-10)', async () => {
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

    it('drops a related lore that no longer exists instead of failing the list (D-10)', async () => {
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

    it('serves the related lore of a single lore (D-10)', async () => {
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

    it('serves the related lore of every enemy (D-10)', async () => {
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

    it('serves a player only the lore they unlocked (D-10)', async () => {
        const body = await request(LORES);

        expect(body.errors).toBeUndefined();
        expect(idsOf(body.data?.lores)).toEqual(
            [String(loreA._id), String(loreB._id)].sort(),
        );
    });

    it('filters the nested related lore to the unlocked set (D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreB._id },
            { relatedLore: [loreA._id, loreC._id] },
        );
        const expected = [{ id: String(loreA._id), name: 'A' }];

        const list = await request(LORES);
        const single = await request(LORE, { id: String(loreB._id) });

        expect(list.errors).toBeUndefined();
        expect(relatedOf(list.data?.lores, loreB._id)).toEqual(expected);
        expect(single.errors).toBeUndefined();
        expect(single.data?.lore?.relatedLore).toEqual(expected);
    });

    it('answers NOT_FOUND for a locked lore exactly like a missing one (D-10)', async () => {
        const locked = await request(LORE, { id: String(loreC._id) });
        const missing = await request(LORE, {
            id: new Types.ObjectId().toHexString(),
        });

        const failureOf = (body: WireBody) => ({
            data: body.data,
            code: body.errors?.[0]?.extensions?.code,
            message: body.errors?.[0]?.message,
        });
        expect(failureOf(locked)).toEqual({
            data: null,
            code: 'NOT_FOUND',
            message: 'Lore non trovata',
        });
        expect(failureOf(locked)).toEqual(failureOf(missing));
    });

    it('serves the innkeeper every lore and every related lore (D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreB._id },
            { relatedLore: [loreA._id, loreC._id] },
        );
        const auth = await innkeeperBearer();

        const list = await request(LORES, undefined, auth);
        const single = await request(LORE, { id: String(loreC._id) }, auth);

        expect(list.errors).toBeUndefined();
        expect(idsOf(list.data?.lores)).toEqual(
            [String(loreA._id), String(loreB._id), String(loreC._id)].sort(),
        );
        expect(relatedOf(list.data?.lores, loreB._id)).toEqual([
            { id: String(loreA._id), name: 'A' },
            { id: String(loreC._id), name: 'C' },
        ]);
        expect(single.errors).toBeUndefined();
        expect(single.data?.lore?.id).toBe(String(loreC._id));
    });

    it('serves nothing to a user without a current character (D-10)', async () => {
        const { bearer: homeless } = await createPlayer(harness, {
            twitchId: 'twitch-lore-homeless',
            withCharacter: false,
        });

        const list = await request(LORES, undefined, homeless);
        const single = await request(LORE, { id: String(loreA._id) }, homeless);

        expect(list).toEqual({ data: { lores: [] } });
        expect(single.data).toBeNull();
        expect(single.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    });

    it('filters the related lore of every enemy (D-10)', async () => {
        const enemy = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
            relatedLore: [loreA._id, loreC._id],
        });

        const player = await request(ENEMY_RELATED);
        const innkeeper = await request(
            ENEMY_RELATED,
            undefined,
            await innkeeperBearer(),
        );

        expect(player.errors).toBeUndefined();
        expect(relatedOf(player.data?.enemys, enemy._id)).toEqual([
            { id: String(loreA._id) },
        ]);
        expect(innkeeper.errors).toBeUndefined();
        expect(relatedOf(innkeeper.data?.enemys, enemy._id)).toEqual([
            { id: String(loreA._id) },
            { id: String(loreC._id) },
        ]);
    });
});
