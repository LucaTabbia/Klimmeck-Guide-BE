// evidenza di HARDEN-02 (FE Phase 12): la matrice è alimentata dalle liste che il boot reale confronta coi
// metadati; validazione GraphQL prima dei guard → asserzioni toEqual sul codice (Pitfall 10)
import request from 'supertest';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { Character } from 'src/models/character/character.model';
import {
    connectAndAwaitClose,
    graphqlWsUrl,
    openSubscription,
} from '../auth/ws-test-client';
import {
    bootRealApp,
    REAL_BOOT_TIMEOUT_MS,
    type RealAppBoot,
} from '../harness/real-app-boot';
import {
    EXPECTED_INNKEEPER_HANDLERS,
    EXPECTED_OWNER_ONLY_HANDLERS,
    EXPECTED_OWNERSHIP_HANDLERS,
    type ProtectedHandler,
} from './expected-handlers';
import { HANDLER_FIXTURES } from './handler-fixtures';
import {
    createMatrixWorld,
    foreignSecretBearer,
    type MatrixWorld,
    NOT_A_JWT_BEARER,
} from './matrix-victims';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

type DeniedRole = 'adventurer' | 'guard';

interface RoleRow {
    handler: ProtectedHandler;
    role: DeniedRole;
}

interface InvalidBearerRow {
    handler: ProtectedHandler;
    bearerCase: string;
    bearer: () => string | null;
}

const DENIED_ROLES: readonly DeniedRole[] = ['adventurer', 'guard'];
const INVALID_BEARERS: readonly Omit<InvalidBearerRow, 'handler'>[] = [
    { bearerCase: 'no bearer', bearer: () => null },
    {
        bearerCase: 'a bearer that is not a JWT',
        bearer: () => NOT_A_JWT_BEARER,
    },
    {
        bearerCase: 'a JWT signed by another secret',
        bearer: foreignSecretBearer,
    },
];
// C-1: il rifiuto alla connection_init è pinnato com'è, nessun errore GraphQL per operazione
const INVALID_SOCKET_PAYLOADS: readonly {
    payloadCase: string;
    payload: Record<string, unknown> | undefined;
}[] = [
    { payloadCase: 'no bearer', payload: undefined },
    {
        payloadCase: 'a bearer that is not a JWT',
        payload: { Authorization: NOT_A_JWT_BEARER },
    },
    {
        payloadCase: 'a JWT signed by another secret',
        payload: { Authorization: foreignSecretBearer() },
    },
];
const CHARACTER_QUERY =
    'query Character($id: String!) { character(id: $id) { id } }';
const USERS_QUERY = 'query Users { users { id } }';
const OWN_CHARACTER_UPDATED =
    'subscription OwnCharacter($id: String!) { characterUpdated(id: $id) { id status { coins { silver } } } }';
const POSITIVE_SILVER = 42;

type OwnCharacterUpdate = {
    characterUpdated: { id: string; status: { coins: { silver: number } } };
};

function httpRows(list: readonly ProtectedHandler[]): ProtectedHandler[] {
    return list.filter((h) => HANDLER_FIXTURES[h].kind !== 'subscription');
}

function wsRows(list: readonly ProtectedHandler[]): ProtectedHandler[] {
    return list.filter((h) => HANDLER_FIXTURES[h].kind === 'subscription');
}

function roleRows(handlers: readonly ProtectedHandler[]): RoleRow[] {
    return handlers.flatMap((handler) =>
        DENIED_ROLES.map((role) => ({ handler, role })),
    );
}

function invalidBearerRows(
    handlers: readonly ProtectedHandler[],
): InvalidBearerRow[] {
    return handlers.flatMap((handler) =>
        INVALID_BEARERS.map((row) => ({ handler, ...row })),
    );
}

function portOf(boot: RealAppBoot): number {
    if (boot.port === null) throw new Error('the matrix boot must listen');
    return boot.port;
}

describe('Authorization matrix (real boot)', () => {
    let boot: RealAppBoot;
    let world: MatrixWorld;

    async function postGraphql(
        query: string,
        variables: Record<string, unknown>,
        bearer: string | null,
    ): Promise<WireBody> {
        const response = await request(boot.app.getHttpServer())
            .post(GRAPHQL_PATH)
            .set(bearer ? { Authorization: bearer } : {})
            .send({ query, variables });
        return response.body as WireBody;
    }

    async function expectRejected(
        handler: ProtectedHandler,
        bearer: string | null,
        expected: { code: string },
    ): Promise<void> {
        const fixture = HANDLER_FIXTURES[handler];
        const body = await postGraphql(
            fixture.document,
            fixture.variables(world.victims),
            bearer,
        );
        expect(body.errors).toHaveLength(1);
        expect(body.errors?.[0]?.extensions).toEqual(expected);
        // un campo nullable torna come null dentro data: si guarda il campo, non l'intero data
        expect(body.data?.[fixture.field] ?? null).toBeNull();
    }

    async function expectSubscriptionForbidden(
        handler: ProtectedHandler,
        bearer: string,
    ): Promise<void> {
        const fixture = HANDLER_FIXTURES[handler];
        const subscription = openSubscription(
            graphqlWsUrl(portOf(boot)),
            { Authorization: bearer },
            {
                query: fixture.document,
                variables: fixture.variables(world.victims),
            },
        );
        try {
            const first = await subscription.next();
            expect(first.value?.errors).toEqual([
                expect.objectContaining({
                    path: [fixture.field],
                    extensions: { code: 'FORBIDDEN' },
                }),
            ]);
        } finally {
            await subscription.dispose();
        }
    }

    beforeAll(async () => {
        boot = await bootRealApp({
            dbName: 'authorization-matrix',
            listen: true,
        });
        world = await createMatrixWorld(boot);
    }, REAL_BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await boot?.close();
    });

    describe('innkeeper handlers over HTTP', () => {
        it.each(roleRows(httpRows(EXPECTED_INNKEEPER_HANDLERS)))(
            'forbids the $role on $handler (D-01)',
            async ({ handler, role }) => {
                await expectRejected(handler, world.bearers[role], {
                    code: 'FORBIDDEN',
                });
            },
        );

        it.each(invalidBearerRows(httpRows(EXPECTED_INNKEEPER_HANDLERS)))(
            'rejects $bearerCase on $handler as unauthenticated (D-01)',
            async ({ handler, bearer }) => {
                await expectRejected(handler, bearer(), {
                    code: 'UNAUTHENTICATED',
                });
            },
        );
    });

    describe('ownership handlers over HTTP', () => {
        it.each(httpRows(EXPECTED_OWNERSHIP_HANDLERS))(
            'forbids an adventurer on the resource of another user via %s (D-01)',
            async (handler) => {
                await expectRejected(handler, world.bearers.adventurer, {
                    code: 'FORBIDDEN',
                });
            },
        );
    });

    describe('owner-only handlers over HTTP', () => {
        it.each(httpRows(EXPECTED_OWNER_ONLY_HANDLERS))(
            'forbids the innkeeper on the resource of another user via %s (D-01)',
            async (handler) => {
                await expectRejected(handler, world.bearers.innkeeper, {
                    code: 'FORBIDDEN',
                });
            },
        );
    });

    describe('innkeeper subscription over WS', () => {
        it.each(roleRows(wsRows(EXPECTED_INNKEEPER_HANDLERS)))(
            'forbids the $role on $handler over the socket (D-01)',
            async ({ handler, role }) => {
                await expectSubscriptionForbidden(handler, world.bearers[role]);
            },
        );

        // il rifiuto avviene alla connection_init, prima di ogni subscription: una riga per payload, non per handler
        it.each(INVALID_SOCKET_PAYLOADS)(
            'closes the connection_init of $payloadCase with 4403, before any subscription (D-01)',
            async ({ payload }) => {
                await expect(
                    connectAndAwaitClose(graphqlWsUrl(portOf(boot)), payload),
                ).resolves.toEqual({
                    code: 4403,
                    reason: 'Forbidden',
                    acknowledged: false,
                });
            },
        );
    });

    describe('ownership subscriptions over WS', () => {
        it.each(wsRows(EXPECTED_OWNERSHIP_HANDLERS))(
            'forbids an adventurer on the resource of another user via %s over the socket (D-01)',
            async (handler) => {
                await expectSubscriptionForbidden(
                    handler,
                    world.bearers.adventurer,
                );
            },
        );
    });

    describe('owner-only subscriptions over WS', () => {
        it.each(wsRows(EXPECTED_OWNER_ONLY_HANDLERS))(
            'forbids the innkeeper on the resource of another user via %s over the socket (D-01)',
            async (handler) => {
                await expectSubscriptionForbidden(
                    handler,
                    world.bearers.innkeeper,
                );
            },
        );
    });

    describe('matrix completeness', () => {
        it('covers every listed handler with exactly one fixture (D-01)', () => {
            const listed = [
                ...new Set<string>([
                    ...EXPECTED_INNKEEPER_HANDLERS,
                    ...EXPECTED_OWNERSHIP_HANDLERS,
                ]),
            ].sort();

            expect(Object.keys(HANDLER_FIXTURES).sort()).toEqual(listed);
        });

        it('runs one row per listed handler (D-01)', () => {
            const subscriptions = new Set([
                ...wsRows(EXPECTED_INNKEEPER_HANDLERS),
                ...wsRows(EXPECTED_OWNERSHIP_HANDLERS),
            ]);

            expect(httpRows(EXPECTED_INNKEEPER_HANDLERS)).toHaveLength(14);
            expect(httpRows(EXPECTED_OWNERSHIP_HANDLERS)).toHaveLength(17);
            expect(httpRows(EXPECTED_OWNER_ONLY_HANDLERS)).toHaveLength(7);
            expect([...subscriptions]).toHaveLength(3);
        });
    });

    describe('positive controls', () => {
        it('lets the owner read its own character (D-01)', async () => {
            const body = await postGraphql(
                CHARACTER_QUERY,
                { id: world.victims.characterId },
                world.bearers.victim,
            );

            expect(body.errors).toBeUndefined();
            expect(body.data).toEqual({
                character: { id: world.victims.characterId },
            });
        });

        it('lets the adventurer read its own character (D-01)', async () => {
            const ownCharacterId = world.ownCharacterIds.adventurer;

            const body = await postGraphql(
                CHARACTER_QUERY,
                { id: ownCharacterId },
                world.bearers.adventurer,
            );

            expect(body.errors).toBeUndefined();
            expect(body.data).toEqual({ character: { id: ownCharacterId } });
        });

        it('lets the innkeeper read the character of another user on behalf (D-01)', async () => {
            const body = await postGraphql(
                CHARACTER_QUERY,
                { id: world.victims.characterId },
                world.bearers.innkeeper,
            );

            expect(body.errors).toBeUndefined();
            expect(body.data).toEqual({
                character: { id: world.victims.characterId },
            });
        });

        it('lets the owner subscribe to its own character over the socket (D-01)', async () => {
            const characterId = world.victims.characterId;
            const subscription = openSubscription<OwnCharacterUpdate>(
                graphqlWsUrl(portOf(boot)),
                { Authorization: world.bearers.victim },
                {
                    query: OWN_CHARACTER_UPDATED,
                    variables: { id: characterId },
                },
            );
            try {
                const snapshot = await subscription.next();
                expect(snapshot.value?.errors).toBeUndefined();
                expect(snapshot.value?.data?.characterUpdated.id).toBe(
                    characterId,
                );

                await boot.connection
                    .model(Character.name)
                    .updateOne(
                        { _id: characterId },
                        { $set: { 'status.coins.silver': POSITIVE_SILVER } },
                    );
                const update = await subscription.next();

                expect(update.value?.errors).toBeUndefined();
                expect(update.value?.data).toEqual({
                    characterUpdated: {
                        id: characterId,
                        status: { coins: { silver: POSITIVE_SILVER } },
                    },
                });
            } finally {
                await subscription.dispose();
            }
        });

        it('lets the innkeeper list the users (D-01)', async () => {
            const body = await postGraphql(
                USERS_QUERY,
                {},
                world.bearers.innkeeper,
            );

            expect(body.errors).toBeUndefined();
            expect(Array.isArray(body.data?.users)).toBe(true);
        });
    });
});
