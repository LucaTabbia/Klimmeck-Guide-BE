// evidenza di HARDEN-02 (FE Phase 12): la matrice è alimentata dalle liste che il boot reale confronta coi
// metadati; validazione GraphQL prima dei guard → asserzioni toEqual sul codice (Pitfall 10)
import request from 'supertest';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
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
const CHARACTER_QUERY =
    'query Character($id: String!) { character(id: $id) { id } }';
const USERS_QUERY = 'query Users { users { id } }';

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

            expect(httpRows(EXPECTED_INNKEEPER_HANDLERS)).toHaveLength(10);
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
