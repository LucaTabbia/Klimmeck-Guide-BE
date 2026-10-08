import request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { AuthProbeResolver } from './auth-probe.resolver';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from './auth-test-app';
import { TEST_DEV_ACCESS_TOKEN, TEST_DEV_TWITCH_ID } from './test-auth-config';
import { createAuthenticatedUser, signTestAccessToken } from './test-tokens';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const DEV_BEARER = `Bearer ${TEST_DEV_ACCESS_TOKEN}`;

const WHO_AM_I = '{ whoAmI }';
const ME = '{ me { id twitchId role } }';
const CREATE_INTRUDER = `mutation { createUser(user: { twitchId: "intruder", role: innkeeper }) { id } }`;
const LOGOUT = 'mutation { logout }';
const REFRESH = `
    mutation Refresh($refreshToken: String!) {
        refreshSession(refreshToken: $refreshToken) { accessToken }
    }
`;
const EXCHANGE = `
    mutation Exchange($ticket: String!, $codeVerifier: String!) {
        exchangeLoginTicket(ticket: $ticket, codeVerifier: $codeVerifier) { accessToken }
    }
`;

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function errorCodeOf(response: request.Response): unknown {
    return bodyOf(response).errors?.[0]?.extensions.code;
}

function expectUnauthenticated(response: request.Response): void {
    expect(response.status).toBe(200);
    expect(errorCodeOf(response)).toBe(AuthErrorCode.UNAUTHENTICATED);
    expect(bodyOf(response).data ?? null).toBeNull();
}

function postRest(
    harness: AuthTestApp,
    path: string,
    bearer?: string,
): request.Test {
    return request(harness.app.getHttpServer())
        .post(path)
        .set(bearer ? { Authorization: bearer } : {});
}

describe('Global auth guard over HTTP GraphQL and REST', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({ providers: [AuthProbeResolver] });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    describe('GraphQL without a valid identity', () => {
        it('rejects a protected query without Authorization', async () => {
            expectUnauthenticated(await graphqlRequest(harness.app, WHO_AM_I));
        });

        it('rejects an existing mutation without a bearer and writes nothing', async () => {
            expectUnauthenticated(
                await graphqlRequest(harness.app, CREATE_INTRUDER),
            );

            const intruder = await harness.connection
                .model<UserDocument>(User.name)
                .findOne({ twitchId: 'intruder' })
                .exec();
            expect(intruder).toBeNull();
        });

        it.each(['Token abc', 'Bearer ', 'Bearer not-a-jwt'])(
            'rejects the malformed Authorization header %p',
            async (authorization) => {
                expectUnauthenticated(
                    await graphqlRequest(
                        harness.app,
                        WHO_AM_I,
                        undefined,
                        authorization,
                    ),
                );
            },
        );

        it('rejects a signed OAuth state used as bearer (token confusion)', async () => {
            const state = await harness.app
                .get(OAuthStateService)
                .sign(CHALLENGE);

            expectUnauthenticated(
                await graphqlRequest(
                    harness.app,
                    WHO_AM_I,
                    undefined,
                    `Bearer ${state}`,
                ),
            );
        });

        it('rejects an expired access token', async () => {
            const expired = signTestAccessToken(
                harness.config,
                {},
                { expired: true },
            );

            expectUnauthenticated(
                await graphqlRequest(
                    harness.app,
                    WHO_AM_I,
                    undefined,
                    `Bearer ${expired}`,
                ),
            );
        });
    });

    describe('GraphQL with a valid access token', () => {
        it('exposes the identity to whoAmI, me and existing resolvers', async () => {
            const { user, bearer } = await createAuthenticatedUser(harness);

            const whoAmI = await graphqlRequest(
                harness.app,
                WHO_AM_I,
                undefined,
                bearer,
            );
            expect(bodyOf(whoAmI).data?.whoAmI).toBe('twitch-http-1');

            const me = await graphqlRequest(harness.app, ME, undefined, bearer);
            expect(bodyOf(me).errors).toBeUndefined();
            expect(bodyOf(me).data?.me).toEqual({
                id: String(user._id),
                twitchId: 'twitch-http-1',
                role: RoleType.adventurer,
            });

            const users = await graphqlRequest(
                harness.app,
                '{ users { id } }',
                undefined,
                bearer,
            );
            expect(bodyOf(users).errors).toBeUndefined();
            expect(bodyOf(users).data?.users).toEqual([
                { id: String(user._id) },
            ]);
        });

        it('revokes the session on logout while the issued access token lives until expiry', async () => {
            const { session, bearer } = await createAuthenticatedUser(harness);

            const logout = await graphqlRequest(
                harness.app,
                LOGOUT,
                undefined,
                bearer,
            );
            expect(bodyOf(logout).data?.logout).toBe(true);

            const refresh = await graphqlRequest(harness.app, REFRESH, {
                refreshToken: session.refreshToken,
            });
            expect(errorCodeOf(refresh)).toBe(AuthErrorCode.SESSION_REVOKED);

            // limite accettato D-27: nessun controllo per-request della sessione
            const whoAmI = await graphqlRequest(
                harness.app,
                WHO_AM_I,
                undefined,
                bearer,
            );
            expect(bodyOf(whoAmI).data?.whoAmI).toBe('twitch-http-1');
        });
    });

    describe('public operations', () => {
        it('reaches refreshSession without a bearer', async () => {
            const response = await graphqlRequest(harness.app, REFRESH, {
                refreshToken: 'unknown',
            });

            expect(errorCodeOf(response)).toBe(AuthErrorCode.SESSION_EXPIRED);
        });

        it('reaches exchangeLoginTicket without a bearer', async () => {
            const response = await graphqlRequest(harness.app, EXCHANGE, {
                ticket: 'unknown-ticket',
                codeVerifier: VERIFIER,
            });

            expect(errorCodeOf(response)).toBe(
                AuthErrorCode.LOGIN_TICKET_INVALID,
            );
        });

        it('serves GET / without a bearer', async () => {
            const response = await request(harness.app.getHttpServer()).get(
                '/',
            );

            expect(response.status).toBe(200);
            expect(response.text).toBe('Hello World!');
        });
    });

    describe('REST Cloudinary', () => {
        it('answers 401 JSON on getUrls without a bearer before calling the service', async () => {
            const response = await postRest(
                harness,
                '/cloudinary/getUrls',
            ).send({ folder: 'x' });

            expect(response.status).toBe(401);
            expect(response.body).toMatchObject({
                statusCode: 401,
                code: AuthErrorCode.UNAUTHENTICATED,
            });
            expect(harness.cloudinary.listResources).not.toHaveBeenCalled();
        });

        it('answers 401 on uploadImage without a bearer before parsing the upload', async () => {
            const response = await postRest(
                harness,
                '/cloudinary/uploadImage',
            ).attach('file', Buffer.from('img'), 'a.png');

            expect(response.status).toBe(401);
            expect(response.body).toMatchObject({
                code: AuthErrorCode.UNAUTHENTICATED,
            });
            expect(harness.cloudinary.uploadImage).not.toHaveBeenCalled();
        });

        it('serves getUrls with a valid bearer', async () => {
            const { bearer } = await createAuthenticatedUser(harness);

            const response = await postRest(
                harness,
                '/cloudinary/getUrls',
                bearer,
            ).send({ folder: 'x' });

            expect(response.status).toBe(201);
            expect(harness.cloudinary.listResources).toHaveBeenCalledWith('x');
        });
    });

    describe('dev bypass enabled', () => {
        it('accepts the dev token identically on GraphQL and REST', async () => {
            const whoAmI = await graphqlRequest(
                harness.app,
                WHO_AM_I,
                undefined,
                DEV_BEARER,
            );
            expect(bodyOf(whoAmI).data?.whoAmI).toBe(TEST_DEV_TWITCH_ID);

            const me = await graphqlRequest(
                harness.app,
                ME,
                undefined,
                DEV_BEARER,
            );
            expect(bodyOf(me).errors).toBeUndefined();
            expect(bodyOf(me).data?.me).toMatchObject({
                twitchId: TEST_DEV_TWITCH_ID,
                role: RoleType.adventurer,
            });

            const rest = await postRest(
                harness,
                '/cloudinary/getUrls',
                DEV_BEARER,
            ).send({ folder: 'x' });
            expect(rest.status).toBe(201);

            const logout = await graphqlRequest(
                harness.app,
                LOGOUT,
                undefined,
                DEV_BEARER,
            );
            expect(bodyOf(logout).data?.logout).toBe(true);
        });
    });
});

describe('Global auth guard with the dev bypass disabled', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            authConfig: { devAuth: null },
            providers: [AuthProbeResolver],
        });
    });

    afterAll(async () => {
        await harness.close();
    });

    it('rejects the dev token on GraphQL', async () => {
        expectUnauthenticated(
            await graphqlRequest(harness.app, WHO_AM_I, undefined, DEV_BEARER),
        );
    });

    it('rejects the dev token on REST with 401', async () => {
        const response = await postRest(
            harness,
            '/cloudinary/getUrls',
            DEV_BEARER,
        ).send({ folder: 'x' });

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
        expect(harness.cloudinary.listResources).not.toHaveBeenCalled();
    });
});
