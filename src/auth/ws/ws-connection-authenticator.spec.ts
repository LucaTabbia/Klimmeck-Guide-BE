import { AuthException } from 'src/auth/auth.exception';
import type { AuthIdentity } from 'src/auth/auth-identity';
import type { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import type { SessionService } from 'src/auth/session/session.service';
import {
    WS_SESSION_REVOKED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_REASON,
} from 'src/auth/ws/ws-close-codes';
import {
    WsConnectionAuthenticator,
    type WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
import type { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';
import { RoleType } from 'src/models/enums/role-type.enum';

const NOW = new Date('2026-10-06T12:00:00.000Z').getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function buildIdentity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
    return {
        userId: 'user-1',
        twitchId: 'twitch-1',
        role: RoleType.adventurer,
        sessionId: 'session-1',
        expiresAt: NOW + 5000,
        ...overrides,
    };
}

describe('WsConnectionAuthenticator', () => {
    let identityResolver: { resolveBearer: jest.Mock };
    let sessions: { revokeReasonOf: jest.Mock };
    let registry: { register: jest.Mock; unregister: jest.Mock };
    let authenticator: WsConnectionAuthenticator;
    let socket: { close: jest.Mock };

    function buildContext(
        connectionParams?: Record<string, unknown>,
    ): WsConnectionContext {
        return {
            connectionParams,
            extra: { socket, request: {} },
            acknowledged: false,
            subscriptions: {},
        } as unknown as WsConnectionContext;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        socket = { close: jest.fn() };
        identityResolver = {
            resolveBearer: jest.fn().mockResolvedValue(buildIdentity()),
        };
        sessions = { revokeReasonOf: jest.fn().mockResolvedValue(null) };
        registry = { register: jest.fn(), unregister: jest.fn() };
        authenticator = new WsConnectionAuthenticator(
            identityResolver as unknown as AuthIdentityResolver,
            sessions as unknown as SessionService,
            registry as unknown as WsSessionRegistry,
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('onConnect', () => {
        it('returns false without throwing when connectionParams are missing', async () => {
            identityResolver.resolveBearer.mockRejectedValue(
                AuthException.unauthenticated(),
            );

            await expect(authenticator.onConnect(buildContext())).resolves.toBe(
                false,
            );
            expect(identityResolver.resolveBearer).toHaveBeenCalledWith(
                undefined,
            );
        });

        it('returns false when the resolver rejects with an AuthException', async () => {
            identityResolver.resolveBearer.mockRejectedValue(
                AuthException.unauthenticated(),
            );

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer bad' }),
                ),
            ).resolves.toBe(false);
        });

        it('returns false when the resolver rejects with a generic error', async () => {
            identityResolver.resolveBearer.mockRejectedValue(
                new Error('internal detail'),
            );

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer t' }),
                ),
            ).resolves.toBe(false);
        });

        it('reads the Authorization connection param', async () => {
            await authenticator.onConnect(
                buildContext({ Authorization: 'Bearer t' }),
            );

            expect(identityResolver.resolveBearer).toHaveBeenCalledWith(
                'Bearer t',
            );
        });

        it('reads the lowercase authorization connection param', async () => {
            await authenticator.onConnect(
                buildContext({ authorization: 'Bearer t' }),
            );

            expect(identityResolver.resolveBearer).toHaveBeenCalledWith(
                'Bearer t',
            );
        });

        it('stores the identity and closes the socket with 4401 when the token expires', async () => {
            const context = buildContext({ Authorization: 'Bearer t' });

            await expect(authenticator.onConnect(context)).resolves.toBe(true);
            expect(context.extra.identity).toEqual(buildIdentity());
            expect(context.extra.expiryTimer).toBeDefined();

            jest.advanceTimersByTime(4999);
            expect(socket.close).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            expect(socket.close).toHaveBeenCalledTimes(1);
            expect(socket.close).toHaveBeenCalledWith(
                WS_TOKEN_EXPIRED_CLOSE_CODE,
                WS_TOKEN_EXPIRED_REASON,
            );
        });

        it('closes on the next tick when the token is already past its expiry', async () => {
            identityResolver.resolveBearer.mockResolvedValue(
                buildIdentity({ expiresAt: NOW - 1000 }),
            );

            await authenticator.onConnect(
                buildContext({ Authorization: 'Bearer t' }),
            );
            jest.advanceTimersByTime(0);

            expect(socket.close).toHaveBeenCalledWith(
                WS_TOKEN_EXPIRED_CLOSE_CODE,
                WS_TOKEN_EXPIRED_REASON,
            );
        });

        it('does not schedule a close for a dev identity without expiry', async () => {
            identityResolver.resolveBearer.mockResolvedValue(
                buildIdentity({ sessionId: undefined, expiresAt: undefined }),
            );
            const context = buildContext({ Authorization: 'Bearer dev' });

            await expect(authenticator.onConnect(context)).resolves.toBe(true);
            jest.advanceTimersByTime(ONE_DAY_MS);

            expect(context.extra.expiryTimer).toBeUndefined();
            expect(socket.close).not.toHaveBeenCalled();
        });

        it('registers the socket of a session before reading its state (D-03)', async () => {
            await authenticator.onConnect(
                buildContext({ Authorization: 'Bearer t' }),
            );

            expect(registry.register).toHaveBeenCalledWith('session-1', socket);
            expect(sessions.revokeReasonOf).toHaveBeenCalledWith('session-1');
            expect(registry.register.mock.invocationCallOrder[0]).toBeLessThan(
                sessions.revokeReasonOf.mock.invocationCallOrder[0],
            );
        });

        it('closes with 4409 and the stored reason and refuses a revoked session (D-03)', async () => {
            sessions.revokeReasonOf.mockResolvedValue({
                reason: SessionRevokeReason.newLogin,
            });

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer t' }),
                ),
            ).resolves.toBe(false);
            jest.advanceTimersByTime(ONE_DAY_MS);

            expect(socket.close).toHaveBeenCalledTimes(1);
            expect(socket.close).toHaveBeenCalledWith(
                WS_SESSION_REVOKED_CLOSE_CODE,
                'newLogin',
            );
        });

        it('closes with 4409 and an empty reason a session revoked without reason (D-03)', async () => {
            sessions.revokeReasonOf.mockResolvedValue({ reason: null });

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer t' }),
                ),
            ).resolves.toBe(false);

            expect(socket.close).toHaveBeenCalledTimes(1);
            expect(socket.close).toHaveBeenCalledWith(
                WS_SESSION_REVOKED_CLOSE_CODE,
                '',
            );
        });

        it('accepts a session whose document is missing (D-03)', async () => {
            sessions.revokeReasonOf.mockResolvedValue(null);

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer t' }),
                ),
            ).resolves.toBe(true);
            jest.advanceTimersByTime(4999);

            expect(socket.close).not.toHaveBeenCalled();
        });

        it('neither registers nor reads when the socket closed while the bearer was resolving (D-03)', async () => {
            const context = buildContext({ Authorization: 'Bearer t' });
            identityResolver.resolveBearer.mockImplementation(() => {
                context.extra.closed = true;
                return Promise.resolve(buildIdentity());
            });

            await expect(authenticator.onConnect(context)).resolves.toBe(true);

            expect(registry.register).not.toHaveBeenCalled();
            expect(sessions.revokeReasonOf).not.toHaveBeenCalled();
        });

        it('neither registers nor reads a dev identity without session (D-03)', async () => {
            identityResolver.resolveBearer.mockResolvedValue(
                buildIdentity({ sessionId: undefined, expiresAt: undefined }),
            );

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer dev' }),
                ),
            ).resolves.toBe(true);

            expect(registry.register).not.toHaveBeenCalled();
            expect(sessions.revokeReasonOf).not.toHaveBeenCalled();
        });

        it('does not arm the expiry timer when the socket closed during the session lookup (D-03)', async () => {
            const context = buildContext({ Authorization: 'Bearer t' });
            sessions.revokeReasonOf.mockImplementation(() => {
                context.extra.closed = true;
                return Promise.resolve(null);
            });

            await expect(authenticator.onConnect(context)).resolves.toBe(true);

            expect(context.extra.expiryTimer).toBeUndefined();
            expect(jest.getTimerCount()).toBe(0);
        });

        it('refuses the connection when the session lookup fails (D-03)', async () => {
            sessions.revokeReasonOf.mockRejectedValue(new Error('db down'));

            await expect(
                authenticator.onConnect(
                    buildContext({ Authorization: 'Bearer t' }),
                ),
            ).resolves.toBe(false);
            jest.advanceTimersByTime(ONE_DAY_MS);

            expect(socket.close).not.toHaveBeenCalledWith(
                WS_SESSION_REVOKED_CLOSE_CODE,
                expect.anything(),
            );
        });
    });

    describe('onClose', () => {
        it('unregisters the socket of its session on close (D-03)', async () => {
            const context = buildContext({ Authorization: 'Bearer t' });
            await authenticator.onConnect(context);

            authenticator.onClose(context);

            expect(registry.unregister).toHaveBeenCalledTimes(1);
            expect(registry.unregister).toHaveBeenCalledWith(
                'session-1',
                socket,
            );

            registry.unregister.mockClear();
            identityResolver.resolveBearer.mockResolvedValue(
                buildIdentity({ sessionId: undefined, expiresAt: undefined }),
            );
            const devContext = buildContext({ Authorization: 'Bearer dev' });
            await authenticator.onConnect(devContext);

            authenticator.onClose(devContext);
            authenticator.onClose(buildContext());

            expect(registry.unregister).not.toHaveBeenCalled();
        });
        it('unregisters the socket of a session refused with 4409 when it closes (D-03)', async () => {
            sessions.revokeReasonOf.mockResolvedValue({
                reason: SessionRevokeReason.userLogout,
            });
            const context = buildContext({ Authorization: 'Bearer t' });
            await authenticator.onConnect(context);

            authenticator.onClose(context);

            expect(registry.unregister.mock.calls).toEqual([
                ['session-1', socket],
            ]);
        });

        it('clears the expiry timer so a closed socket is never closed again', async () => {
            const context = buildContext({ Authorization: 'Bearer t' });
            await authenticator.onConnect(context);

            authenticator.onClose(context);
            jest.advanceTimersByTime(10_000);

            expect(socket.close).not.toHaveBeenCalled();
        });

        it('prevents the expiry timer when the socket closes while the identity is resolving (IN-02)', async () => {
            let resolveIdentity: (identity: AuthIdentity) => void = () => {};
            identityResolver.resolveBearer.mockReturnValue(
                new Promise<AuthIdentity>((resolve) => {
                    resolveIdentity = resolve;
                }),
            );
            const context = buildContext({ Authorization: 'Bearer t' });

            const connecting = authenticator.onConnect(context);
            authenticator.onClose(context);
            resolveIdentity(buildIdentity());
            await connecting;
            jest.advanceTimersByTime(10_000);

            expect(context.extra.expiryTimer).toBeUndefined();
            expect(socket.close).not.toHaveBeenCalled();
        });

        it('does not throw on a context without a timer', () => {
            expect(() => authenticator.onClose(buildContext())).not.toThrow();
        });
    });
});
