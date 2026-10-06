import { AuthException } from 'src/auth/auth.exception';
import type { AuthIdentity } from 'src/auth/auth-identity';
import type { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import {
    WS_TOKEN_EXPIRED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_REASON,
} from 'src/auth/ws/ws-close-codes';
import {
    WsConnectionAuthenticator,
    type WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
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
        authenticator = new WsConnectionAuthenticator(
            identityResolver as unknown as AuthIdentityResolver,
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
    });

    describe('onClose', () => {
        it('clears the expiry timer so a closed socket is never closed again', async () => {
            const context = buildContext({ Authorization: 'Bearer t' });
            await authenticator.onConnect(context);

            authenticator.onClose(context);
            jest.advanceTimersByTime(10_000);

            expect(socket.close).not.toHaveBeenCalled();
        });

        it('does not throw on a context without a timer', () => {
            expect(() => authenticator.onClose(buildContext())).not.toThrow();
        });
    });
});
