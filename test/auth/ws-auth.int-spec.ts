import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import WebSocket from 'ws';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { SessionService } from 'src/auth/session/session.service';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';
import { AuthProbeResolver } from './auth-probe.resolver';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from './auth-test-app';
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
const SESSION_REVOKED_CLOSE_CODE = 4409;
const INTERNAL_ERROR_CLOSE_CODE = 4500;
const LEGACY_SUBPROTOCOL = 'graphql-ws';
const SUBPROTOCOL_NOT_ACCEPTABLE_CLOSE_CODE = 4406;
const ABNORMAL_CLOSURE_CODE = 1006;
const EXPIRY_CLOSE_TIMEOUT_MS = 8000;
const MIN_LIFETIME_BEFORE_EXPIRY_MS = 2000;
const REGISTRY_POLL_INTERVAL_MS = 20;
const REGISTRY_POLL_ATTEMPTS = 100;

function expectForbidden(event: WsCloseEvent): void {
    expect(event).toEqual({
        code: FORBIDDEN_CLOSE_CODE,
        reason: FORBIDDEN_REASON,
        acknowledged: false,
    });
    expect(event.code).not.toBe(INTERNAL_ERROR_CLOSE_CODE);
}

function sessionIdOf(accessToken: string): string {
    return new JwtService().decode<{ sid: string }>(accessToken).sid;
}

async function waitUntilUnregistered(
    registry: WsSessionRegistry,
    sessionId: string,
): Promise<boolean> {
    for (let attempt = 0; attempt < REGISTRY_POLL_ATTEMPTS; attempt++) {
        if (!registry.isRegistered(sessionId)) return true;
        await new Promise((resolve) =>
            setTimeout(resolve, REGISTRY_POLL_INTERVAL_MS),
        );
    }
    return !registry.isRegistered(sessionId);
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

        describe('connection_init of a revoked session (D-03)', () => {
            let openSockets: WebSocket[] = [];

            async function openTracked(bearer: string) {
                const opened = await openAcknowledgedSocket(url, {
                    Authorization: bearer,
                });
                openSockets.push(opened.socket);
                return opened;
            }

            afterEach(() => {
                openSockets.forEach((socket) => socket.terminate());
                openSockets = [];
            });

            it('closes with 4409 and userLogout a connection_init after logout (D-03)', async () => {
                const { session, bearer } = await createAuthenticatedUser(
                    harness,
                    { twitchId: 'twitch-ws-logout' },
                );
                await graphqlRequest(
                    harness.app,
                    'mutation { logout }',
                    undefined,
                    bearer,
                ).expect(200);

                await expect(
                    connectAndAwaitClose(url, { Authorization: bearer }),
                ).resolves.toEqual({
                    code: SESSION_REVOKED_CLOSE_CODE,
                    reason: 'userLogout',
                    acknowledged: false,
                });
                await expect(
                    waitUntilUnregistered(
                        harness.app.get(WsSessionRegistry),
                        sessionIdOf(session.accessToken),
                    ),
                ).resolves.toBe(true);
            });

            it('closes with 4409 and an empty reason a session revoked without reason (D-03)', async () => {
                const { session, bearer } = await createAuthenticatedUser(
                    harness,
                    { twitchId: 'twitch-ws-legacy' },
                );
                await harness.app
                    .get(SessionService)
                    .revoke(sessionIdOf(session.accessToken), null);

                await expect(
                    connectAndAwaitClose(url, { Authorization: bearer }),
                ).resolves.toEqual({
                    code: SESSION_REVOKED_CLOSE_CODE,
                    reason: '',
                    acknowledged: false,
                });
            });

            it('accepts a JWT whose session document is missing (D-03)', async () => {
                const token = signTestAccessToken(harness.config, {
                    sid: new Types.ObjectId().toHexString(),
                });

                const { socket } = await openTracked(`Bearer ${token}`);

                expect(socket.readyState).toBe(WebSocket.OPEN);
            });

            it('closes every live socket of a revoked session through the registry (D-03)', async () => {
                const revoked = await createAuthenticatedUser(harness, {
                    twitchId: 'twitch-ws-revoked',
                });
                const bystander = await createAuthenticatedUser(harness, {
                    twitchId: 'twitch-ws-bystander',
                });
                const first = await openTracked(revoked.bearer);
                const second = await openTracked(revoked.bearer);
                const untouched = await openTracked(bystander.bearer);

                harness.app
                    .get(WsSessionRegistry)
                    .closeSessions(
                        [sessionIdOf(revoked.session.accessToken)],
                        SessionRevokeReason.roleChanged,
                    );

                const expected = {
                    code: SESSION_REVOKED_CLOSE_CODE,
                    reason: 'roleChanged',
                    acknowledged: true,
                };
                await expect(first.closed).resolves.toEqual(expected);
                await expect(second.closed).resolves.toEqual(expected);
                expect(untouched.socket.readyState).toBe(WebSocket.OPEN);
            });

            it('forgets a socket closed by the client (D-03)', async () => {
                const { session, bearer } = await createAuthenticatedUser(
                    harness,
                    { twitchId: 'twitch-ws-forget' },
                );
                const sessionId = sessionIdOf(session.accessToken);
                const registry = harness.app.get(WsSessionRegistry);
                const { socket, closed } = await openTracked(bearer);
                expect(registry.isRegistered(sessionId)).toBe(true);

                socket.close();
                await closed;

                await expect(
                    waitUntilUnregistered(registry, sessionId),
                ).resolves.toBe(true);
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
