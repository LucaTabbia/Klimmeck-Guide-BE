import type WebSocket from 'ws';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import { AuthProbeResolver } from './auth-probe.resolver';
import { AuthTestApp, createAuthTestApp } from './auth-test-app';
import { TEST_DEV_ACCESS_TOKEN, TEST_DEV_TWITCH_ID } from './test-auth-config';
import { createAuthenticatedUser, signTestAccessToken } from './test-tokens';
import {
    connectAndAwaitClose,
    graphqlWsUrl,
    openAcknowledgedSocket,
    subscribeOnce,
    WsCloseEvent,
} from './ws-test-client';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const AUTH_PROBE = 'subscription { authProbe }';
const DEV_BEARER = `Bearer ${TEST_DEV_ACCESS_TOKEN}`;
// valori del contratto FE asseriti letterali: un cambio silenzioso delle costanti deve rompere il test
const FORBIDDEN_CLOSE_CODE = 4403;
const FORBIDDEN_REASON = 'Forbidden';
const TOKEN_EXPIRED_CLOSE_CODE = 4401;
const TOKEN_EXPIRED_REASON = 'Token expired';
const INTERNAL_ERROR_CLOSE_CODE = 4500;
const LEGACY_SUBPROTOCOL = 'graphql-ws';
const SUBPROTOCOL_NOT_ACCEPTABLE_CLOSE_CODE = 4406;
const ABNORMAL_CLOSURE_CODE = 1006;
const EXPIRY_CLOSE_TIMEOUT_MS = 8000;
const MIN_LIFETIME_BEFORE_EXPIRY_MS = 2000;

function expectForbidden(event: WsCloseEvent): void {
    expect(event).toEqual({
        code: FORBIDDEN_CLOSE_CODE,
        reason: FORBIDDEN_REASON,
        acknowledged: false,
    });
    expect(event.code).not.toBe(INTERNAL_ERROR_CLOSE_CODE);
}

describe('graphql-ws authentication on real sockets', () => {
    describe('with the dev bypass enabled', () => {
        let harness: AuthTestApp;
        let url: string;

        beforeAll(async () => {
            harness = await createAuthTestApp({
                providers: [AuthProbeResolver],
            });
            url = graphqlWsUrl(harness.port);
        });

        afterEach(async () => {
            await harness.clearDatabase();
        });

        afterAll(async () => {
            await harness.close();
        });

        describe('connection_init rejected with 4403', () => {
            it('closes a connection without Authorization', async () => {
                expectForbidden(await connectAndAwaitClose(url, {}));
            });

            it('closes a connection without a connection_init payload', async () => {
                expectForbidden(await connectAndAwaitClose(url));
            });

            it('closes a connection with a bearer that is not a JWT', async () => {
                expectForbidden(
                    await connectAndAwaitClose(url, {
                        Authorization: 'Bearer not-a-jwt',
                    }),
                );
            });

            it('closes a connection with a token signed by another secret', async () => {
                const forged = signTestAccessToken({
                    ...harness.config,
                    jwtSecret: 'another-secret-0123456789abcdef-0123456789',
                });

                expectForbidden(
                    await connectAndAwaitClose(url, {
                        Authorization: `Bearer ${forged}`,
                    }),
                );
            });

            it('closes a connection with an expired access token', async () => {
                const expired = signTestAccessToken(
                    harness.config,
                    {},
                    { expired: true },
                );

                expectForbidden(
                    await connectAndAwaitClose(url, {
                        Authorization: `Bearer ${expired}`,
                    }),
                );
            });

            it('closes a connection with a signed OAuth state used as bearer', async () => {
                const state = await harness.app
                    .get(OAuthStateService)
                    .sign(CHALLENGE);

                expectForbidden(
                    await connectAndAwaitClose(url, {
                        Authorization: `Bearer ${state}`,
                    }),
                );
            });
        });

        describe('connection_init accepted', () => {
            it('exposes the session identity to the subscription resolver', async () => {
                const { user, bearer } = await createAuthenticatedUser(
                    harness,
                    { twitchId: 'twitch-ws-1' },
                );

                await expect(
                    subscribeOnce(url, { Authorization: bearer }, AUTH_PROBE),
                ).resolves.toEqual({ data: { authProbe: user.twitchId } });
            });

            it('accepts the lowercase authorization connection param', async () => {
                const { user, bearer } = await createAuthenticatedUser(
                    harness,
                    { twitchId: 'twitch-ws-2' },
                );

                await expect(
                    subscribeOnce(url, { authorization: bearer }, AUTH_PROBE),
                ).resolves.toEqual({ data: { authProbe: user.twitchId } });
            });

            it('accepts the dev token as on HTTP', async () => {
                await expect(
                    subscribeOnce(
                        url,
                        { Authorization: DEV_BEARER },
                        AUTH_PROBE,
                    ),
                ).resolves.toEqual({ data: { authProbe: TEST_DEV_TWITCH_ID } });
            });
        });

        describe('legacy subscriptions-transport-ws subprotocol', () => {
            // il server non seleziona 'graphql-ws': il client ws abortisce l'handshake prima del 4406 lato server
            it('never acknowledges a client asking only for the legacy subprotocol', async () => {
                const event = await connectAndAwaitClose(
                    url,
                    { Authorization: DEV_BEARER },
                    { subprotocols: [LEGACY_SUBPROTOCOL] },
                );

                expect(event.acknowledged).toBe(false);
                expect(event.code).toBe(ABNORMAL_CLOSURE_CODE);
            });

            it('closes with 4406 a socket opened without graphql-transport-ws', async () => {
                const event = await connectAndAwaitClose(
                    url,
                    { Authorization: DEV_BEARER },
                    { subprotocols: [] },
                );

                expect(event).toEqual({
                    code: SUBPROTOCOL_NOT_ACCEPTABLE_CLOSE_CODE,
                    reason: 'Subprotocol not acceptable',
                    acknowledged: false,
                });
            });
        });
    });

    describe('with the dev bypass disabled', () => {
        let harness: AuthTestApp;

        beforeAll(async () => {
            harness = await createAuthTestApp({
                providers: [AuthProbeResolver],
                authConfig: { devAuth: null },
            });
        });

        afterAll(async () => {
            await harness.close();
        });

        it('closes a connection with the dev token with 4403', async () => {
            expectForbidden(
                await connectAndAwaitClose(graphqlWsUrl(harness.port), {
                    Authorization: DEV_BEARER,
                }),
            );
        });
    });

    describe('with a short-lived access token', () => {
        let harness: AuthTestApp;
        let openSocket: WebSocket | undefined;

        beforeAll(async () => {
            harness = await createAuthTestApp({
                providers: [AuthProbeResolver],
                authConfig: { accessTokenTtlSeconds: 4 },
            });
        });

        afterEach(async () => {
            openSocket?.terminate();
            openSocket = undefined;
            await harness.clearDatabase();
        });

        afterAll(async () => {
            await harness.close();
        });

        it('closes a live socket with 4401 when the access token expires', async () => {
            const { bearer } = await createAuthenticatedUser(harness);

            const { socket, closed } = await openAcknowledgedSocket(
                graphqlWsUrl(harness.port),
                { Authorization: bearer },
                EXPIRY_CLOSE_TIMEOUT_MS,
            );
            openSocket = socket;
            const acknowledgedAt = Date.now();
            const event = await closed;

            expect(event).toEqual({
                code: TOKEN_EXPIRED_CLOSE_CODE,
                reason: TOKEN_EXPIRED_REASON,
                acknowledged: true,
            });
            expect(Date.now() - acknowledgedAt).toBeGreaterThanOrEqual(
                MIN_LIFETIME_BEFORE_EXPIRY_MS,
            );
        }, 15_000);
    });
});
