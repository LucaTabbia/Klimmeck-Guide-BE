import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthException } from 'src/auth/auth.exception';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import type { DevAuthStrategy } from 'src/auth/dev/dev-auth.strategy';
import type { AccessTokenService } from 'src/auth/token/access-token.service';
import { RoleType } from 'src/models/enums/role-type.enum';

const DEV_IDENTITY: AuthIdentity = {
    userId: 'dev-user',
    twitchId: 'dev-twitch-1',
    role: RoleType.innkeeper,
};

const JWT_IDENTITY: AuthIdentity = {
    userId: 'jwt-user',
    twitchId: 'twitch-42',
    role: RoleType.adventurer,
    sessionId: 'session-1',
    expiresAt: 1_700_000_000_000,
};

describe('AuthIdentityResolver', () => {
    let devAuthStrategy: { tryResolve: jest.Mock };
    let accessTokenService: { verify: jest.Mock };
    let resolver: AuthIdentityResolver;

    beforeEach(() => {
        devAuthStrategy = { tryResolve: jest.fn().mockResolvedValue(null) };
        accessTokenService = {
            verify: jest.fn().mockResolvedValue(JWT_IDENTITY),
        };
        resolver = new AuthIdentityResolver(
            devAuthStrategy as unknown as DevAuthStrategy,
            accessTokenService as unknown as AccessTokenService,
        );
    });

    it.each([[undefined], ['Token x']])(
        'rejects %p as UNAUTHENTICATED without consulting any strategy',
        async (authorization) => {
            await expect(
                resolver.resolveBearer(authorization),
            ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
            expect(devAuthStrategy.tryResolve).not.toHaveBeenCalled();
            expect(accessTokenService.verify).not.toHaveBeenCalled();
        },
    );

    it('returns the dev identity without verifying a JWT', async () => {
        devAuthStrategy.tryResolve.mockResolvedValue(DEV_IDENTITY);

        await expect(
            resolver.resolveBearer('Bearer dev-token'),
        ).resolves.toEqual(DEV_IDENTITY);
        expect(devAuthStrategy.tryResolve).toHaveBeenCalledWith('dev-token');
        expect(accessTokenService.verify).not.toHaveBeenCalled();
    });

    it('falls back to the access token when the dev strategy declines', async () => {
        await expect(
            resolver.resolveBearer('Bearer jwt.token.value'),
        ).resolves.toEqual(JWT_IDENTITY);
        expect(accessTokenService.verify).toHaveBeenCalledWith(
            'jwt.token.value',
        );
    });

    it('propagates the UNAUTHENTICATED error from access token verification', async () => {
        accessTokenService.verify.mockRejectedValue(
            AuthException.unauthenticated(),
        );

        await expect(
            resolver.resolveBearer('Bearer bad.token'),
        ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
    });
});
