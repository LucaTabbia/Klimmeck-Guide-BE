import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';

const USERS = '{ users { id } }';
const USER = 'query User($id: String!) { user(id: $id) { id twitchId } }';
const ME = '{ me { id role } }';
const CREATE_INTRUDER =
    'mutation { createUser(user: { twitchId: "intruder", role: innkeeper }) { id } }';
const MISSING_USER_ID = '64b0000000000000000000ff';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function expectRejected(
    response: request.Response,
    extensions: Record<string, unknown>,
): void {
    expect(bodyOf(response).errors?.[0]?.extensions).toEqual(extensions);
    expect(bodyOf(response).data ?? null).toBeNull();
}

function idOf(player: TestPlayer): string {
    return String(player.user._id);
}

describe('Users perimeter (innkeeper-only reads, no client writes)', () => {
    let harness: AuthTestApp;
    let adventurer: TestPlayer;
    let guardia: TestPlayer;
    let oste: TestPlayer;

    beforeAll(async () => {
        harness = await createAuthTestApp();
    });

    beforeEach(async () => {
        adventurer = await createPlayer(harness, {
            twitchId: 'twitch-users-adventurer',
            withCharacter: false,
        });
        guardia = await createPlayer(harness, {
            twitchId: 'twitch-users-guard',
            role: RoleType.guard,
            withCharacter: false,
        });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-users-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    describe('users', () => {
        it('forbids the adventurer', async () => {
            expectRejected(
                await graphqlRequest(
                    harness.app,
                    USERS,
                    undefined,
                    adventurer.bearer,
                ),
                { code: 'FORBIDDEN' },
            );
        });

        it('forbids the guard', async () => {
            expectRejected(
                await graphqlRequest(
                    harness.app,
                    USERS,
                    undefined,
                    guardia.bearer,
                ),
                { code: 'FORBIDDEN' },
            );
        });

        it('lists every user to the innkeeper', async () => {
            const response = await graphqlRequest(
                harness.app,
                USERS,
                undefined,
                oste.bearer,
            );

            expect(bodyOf(response).errors).toBeUndefined();
            const ids = (bodyOf(response).data?.users as { id: string }[])
                .map(({ id }) => id)
                .sort();
            expect(ids).toEqual(
                [idOf(adventurer), idOf(guardia), idOf(oste)].sort(),
            );
        });

        it('stays unauthenticated without a bearer', async () => {
            expectRejected(await graphqlRequest(harness.app, USERS), {
                code: AuthErrorCode.UNAUTHENTICATED,
            });
        });
    });

    describe('user(id)', () => {
        it('forbids the adventurer even on their own id', async () => {
            expectRejected(
                await graphqlRequest(
                    harness.app,
                    USER,
                    { id: idOf(adventurer) },
                    adventurer.bearer,
                ),
                { code: 'FORBIDDEN' },
            );
        });

        it('returns the requested user to the innkeeper', async () => {
            const response = await graphqlRequest(
                harness.app,
                USER,
                { id: idOf(adventurer) },
                oste.bearer,
            );

            expect(bodyOf(response).errors).toBeUndefined();
            expect(bodyOf(response).data?.user).toEqual({
                id: idOf(adventurer),
                twitchId: 'twitch-users-adventurer',
            });
        });

        it('answers a typed NOT_FOUND for an unknown id', async () => {
            expectRejected(
                await graphqlRequest(
                    harness.app,
                    USER,
                    { id: MISSING_USER_ID },
                    oste.bearer,
                ),
                { code: 'NOT_FOUND' },
            );
        });
    });

    it('keeps me available to the adventurer', async () => {
        const response = await graphqlRequest(
            harness.app,
            ME,
            undefined,
            adventurer.bearer,
        );

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.me).toEqual({
            id: idOf(adventurer),
            role: RoleType.adventurer,
        });
    });

    it('drops the user CRUD from the schema while keeping userUpdated', () => {
        const schema = printSchema(harness.app.get(GraphQLSchemaHost).schema);

        expect(schema).not.toContain('createUser(');
        expect(schema).not.toContain('updateUser(');
        expect(schema).not.toContain('deleteUser(');
        expect(schema).not.toContain('input UserInput');
        expect(schema).toContain('userUpdated: User!');
    });

    it('rejects createUser at validation even for the innkeeper and writes nothing', async () => {
        const response = await graphqlRequest(
            harness.app,
            CREATE_INTRUDER,
            undefined,
            oste.bearer,
        );

        expect(bodyOf(response).errors?.[0]?.extensions.code).toBe(
            'GRAPHQL_VALIDATION_FAILED',
        );
        const intruder = await harness.connection
            .model<UserDocument>(User.name)
            .findOne({ twitchId: 'intruder' })
            .exec();
        expect(intruder).toBeNull();
    });
});
