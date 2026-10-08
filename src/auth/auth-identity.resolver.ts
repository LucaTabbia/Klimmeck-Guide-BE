import { Injectable } from '@nestjs/common';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthException } from 'src/auth/auth.exception';
import { extractBearerToken } from 'src/auth/bearer-token';
import { DevAuthStrategy } from 'src/auth/dev/dev-auth.strategy';
import { AccessTokenService } from 'src/auth/token/access-token.service';

@Injectable()
export class AuthIdentityResolver {
    constructor(
        private readonly devAuthStrategy: DevAuthStrategy,
        private readonly accessTokenService: AccessTokenService,
    ) {}

    async resolveBearer(authorization: unknown): Promise<AuthIdentity> {
        const token = extractBearerToken(authorization);
        if (!token) throw AuthException.unauthenticated();
        const devIdentity = await this.devAuthStrategy.tryResolve(token);
        if (devIdentity) return devIdentity;
        return this.accessTokenService.verify(token);
    }
}
