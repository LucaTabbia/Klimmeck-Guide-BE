import request from 'supertest';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { LoreModule } from 'src/lore/lore.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import {
    PROBE_RAW_MESSAGE,
    ProductionProbeResolver,
} from '../../test/graphql/production-probe.resolver';

const INTROSPECTION = '{ __schema { queryType { name } } }';
const MISSING_ID = '64b0000000000000000000ff';
const UUID_PATTERN = /^[0-9a-f-]{36}$/;

interface WireError {
    message: string;
    locations?: { line: number; column: number }[];
    path?: string[];
    extensions?: Record<string, unknown>;
}

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: WireError[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function postWithRequestId(
    harness: AuthTestApp,
    query: string,
    requestId: string,
): request.Test {
    return request(harness.app.getHttpServer())
        .post(GRAPHQL_PATH)
        .set('x-request-id', requestId)
        .send({ query });
}

function landingPage(harness: AuthTestApp): request.Test {
    return request(harness.app.getHttpServer())
        .get(GRAPHQL_PATH)
        .set('Accept', 'text/html');
}

describe('GraphQL surface in production (wire)', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            runtime: { mode: 'production', production: true },
            providers: [ProductionProbeResolver],
            imports: [LoreModule],
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('refuses HTTP introspection in production (D-05)', async () => {
        const body = bodyOf(await graphqlRequest(harness.app, INTROSPECTION));

        expect(body.data).toBeUndefined();
        expect(body.errors).toEqual([
            {
                message: expect.stringContaining(
                    'introspection is not allowed',
                ) as string,
                locations: [{ line: 1, column: 3 }],
                extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
            },
        ]);
    });

    it('suggests no schema field in production (D-07)', async () => {
        const body = bodyOf(await graphqlRequest(harness.app, '{ boo }'));

        expect(body.errors?.[0]?.message).toEqual(
            'Cannot query field "boo" on type "Query".',
        );
    });

    it('serves no landing page in production (D-05)', async () => {
        const response = await landingPage(harness);

        expect(response.status).toBe(400);
        expect(response.type).not.toBe('text/html');
    });

    it('hides an unexpected error behind INTERNAL_SERVER_ERROR and a request id (D-07)', async () => {
        const body = bodyOf(
            await postWithRequestId(harness, '{ probeBoom }', 'probe-1'),
        );

        expect(body.data).toBeNull();
        expect(body.errors).toEqual([
            {
                message: 'Errore interno',
                locations: [{ line: 1, column: 3 }],
                path: ['probeBoom'],
                extensions: {
                    code: 'INTERNAL_SERVER_ERROR',
                    requestId: 'probe-1',
                },
            },
        ]);
    });

    it('generates a request id when the header is unusable (D-07)', async () => {
        const body = bodyOf(
            await postWithRequestId(harness, '{ probeBoom }', 'a b'),
        );

        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'INTERNAL_SERVER_ERROR',
            requestId: expect.stringMatching(UUID_PATTERN) as string,
        });
    });

    it('keeps the domain codes in production (D-07)', async () => {
        const { bearer } = await createPlayer(harness, {
            twitchId: 'twitch-production-surface',
        });

        const domain = bodyOf(
            await graphqlRequest(harness.app, '{ probeDomain }'),
        );
        const missing = bodyOf(
            await graphqlRequest(
                harness.app,
                'query Q($id: String!) { lore(id: $id) { id } }',
                { id: MISSING_ID },
                bearer,
            ),
        );

        expect(domain.errors).toEqual([
            {
                message: 'Monete insufficienti',
                locations: [{ line: 1, column: 3 }],
                path: ['probeDomain'],
                extensions: { code: 'INSUFFICIENT_FUNDS' },
            },
        ]);
        expect(missing.errors).toEqual([
            {
                message: 'Lore non trovata',
                locations: [{ line: 1, column: 25 }],
                path: ['lore'],
                extensions: { code: 'NOT_FOUND' },
            },
        ]);
    });
});

describe('GraphQL surface outside production (wire)', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            providers: [ProductionProbeResolver],
        });
    });

    afterAll(async () => {
        await harness.close();
    });

    it('keeps introspection and raw messages in development (D-05)', async () => {
        const introspection = bodyOf(
            await graphqlRequest(harness.app, INTROSPECTION),
        );
        const boom = bodyOf(
            await postWithRequestId(harness, '{ probeBoom }', 'probe-dev'),
        );
        const typo = bodyOf(await graphqlRequest(harness.app, '{ boo }'));

        expect(introspection.data).toEqual({
            __schema: { queryType: { name: 'Query' } },
        });
        expect(boom.errors?.[0]?.message).toBe(PROBE_RAW_MESSAGE);
        expect(boom.errors?.[0]?.extensions).toEqual({
            code: 'INTERNAL_SERVER_ERROR',
            requestId: 'probe-dev',
        });
        expect(typo.errors?.[0]?.message).toContain('Did you mean');
    });

    it('keeps the landing page outside production (D-05)', async () => {
        const response = await landingPage(harness);

        expect(response.status).toBe(200);
        expect(response.type).toBe('text/html');
    });
});
