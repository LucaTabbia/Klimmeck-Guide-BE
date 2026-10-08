import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthException } from 'src/auth/auth.exception';
import type { AuthIdentity } from 'src/auth/auth-identity';
import type { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { Public } from 'src/auth/decorators/public.decorator';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleType } from 'src/models/enums/role-type.enum';

const NOW = new Date('2026-10-06T12:00:00.000Z').getTime();
const BEARER = 'Bearer access-token';

type FakeRequest = {
    headers: Record<string, string | undefined>;
    user?: AuthIdentity;
};

class ProbeHandlers {
    @Public()
    publicHandler(): void {}

    protectedHandler(): void {}
}

function buildIdentity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
    return {
        userId: 'user-1',
        twitchId: 'twitch-1',
        role: RoleType.adventurer,
        sessionId: 'session-1',
        expiresAt: NOW + 60_000,
        ...overrides,
    };
}

function buildRequest(authorization?: string): FakeRequest {
    return { headers: { authorization } };
}

function handlerOf(name: keyof ProbeHandlers): () => void {
    return ProbeHandlers.prototype[name];
}

function httpContext(
    request: FakeRequest,
    handler = handlerOf('protectedHandler'),
): ExecutionContext {
    return {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => ProbeHandlers,
        getArgs: () => [request],
    } as unknown as ExecutionContext;
}

function graphqlContext(
    gqlContext: Record<string, unknown>,
    handler = handlerOf('protectedHandler'),
): ExecutionContext {
    const args = [{}, {}, gqlContext, {}];
    return {
        getType: () => 'graphql',
        getArgs: () => args,
        getArgByIndex: (index: number) => args[index],
        getHandler: () => handler,
        getClass: () => ProbeHandlers,
    } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
    let identityResolver: { resolveBearer: jest.Mock };
    let guard: AuthGuard;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        identityResolver = {
            resolveBearer: jest.fn().mockResolvedValue(buildIdentity()),
        };
        guard = new AuthGuard(
            new Reflector(),
            identityResolver as unknown as AuthIdentityResolver,
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('lets a @Public handler through without resolving any bearer', async () => {
        const request = buildRequest();

        await expect(
            guard.canActivate(httpContext(request, handlerOf('publicHandler'))),
        ).resolves.toBe(true);
        expect(identityResolver.resolveBearer).not.toHaveBeenCalled();
        expect(request.user).toBeUndefined();
    });

    it('resolves the http Authorization header and attaches the identity to the request', async () => {
        const identity = buildIdentity();
        identityResolver.resolveBearer.mockResolvedValue(identity);
        const request = buildRequest(BEARER);

        await expect(guard.canActivate(httpContext(request))).resolves.toBe(
            true,
        );
        expect(identityResolver.resolveBearer).toHaveBeenCalledWith(BEARER);
        expect(request.user).toBe(identity);
    });

    it('rejects an http request whose bearer cannot be resolved', async () => {
        identityResolver.resolveBearer.mockRejectedValue(
            AuthException.unauthenticated(),
        );

        await expect(
            guard.canActivate(httpContext(buildRequest('Bearer forged'))),
        ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
    });

    it('resolves the bearer of a graphql http operation from the context request', async () => {
        const identity = buildIdentity();
        identityResolver.resolveBearer.mockResolvedValue(identity);
        const request = buildRequest(BEARER);

        await expect(
            guard.canActivate(graphqlContext({ req: request })),
        ).resolves.toBe(true);
        expect(identityResolver.resolveBearer).toHaveBeenCalledWith(BEARER);
        expect(request.user).toBe(identity);
    });

    it('reuses the identity resolved at websocket connect time without reading headers', async () => {
        const identity = buildIdentity();
        const request = buildRequest(BEARER);

        await expect(
            guard.canActivate(
                graphqlContext({ req: request, extra: { identity } }),
            ),
        ).resolves.toBe(true);
        expect(identityResolver.resolveBearer).not.toHaveBeenCalled();
        expect(request.user).toBe(identity);
    });

    it('rejects a websocket operation without a connect-time identity', async () => {
        await expect(
            guard.canActivate(
                graphqlContext({ req: buildRequest(BEARER), extra: {} }),
            ),
        ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
        expect(identityResolver.resolveBearer).not.toHaveBeenCalled();
    });

    it('rejects a websocket operation whose identity has already expired', async () => {
        const identity = buildIdentity({ expiresAt: NOW });

        await expect(
            guard.canActivate(
                graphqlContext({ req: buildRequest(), extra: { identity } }),
            ),
        ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
    });

    it('accepts a websocket dev identity that has no expiry', async () => {
        const identity = buildIdentity({
            sessionId: undefined,
            expiresAt: undefined,
        });
        const request = buildRequest();

        await expect(
            guard.canActivate(
                graphqlContext({ req: request, extra: { identity } }),
            ),
        ).resolves.toBe(true);
        expect(request.user).toBe(identity);
    });

    it('rejects a graphql operation without a request in its context', async () => {
        await expect(
            guard.canActivate(graphqlContext({})),
        ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
    });
});
