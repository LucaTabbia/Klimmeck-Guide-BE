import { Inject, Injectable } from '@nestjs/common';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { safeEqual } from 'src/auth/crypto/token-crypto';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig, DevAuthConfig } from 'src/config/auth-config';
import { RUNTIME_CONFIG } from 'src/config/runtime-config';
import type { RuntimeConfig } from 'src/config/runtime-config';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class DevAuthStrategy {
    private stubIdentity: Promise<AuthIdentity> | null = null;

    constructor(
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
        @Inject(RUNTIME_CONFIG) private readonly runtime: RuntimeConfig,
        private readonly usersService: UsersService,
    ) {}

    async tryResolve(token: string): Promise<AuthIdentity | null> {
        const devAuth = this.config.devAuth;
        if (!devAuth || this.runtime.production) return null;
        if (!safeEqual(token, devAuth.accessToken)) return null;
        return this.resolveStubIdentity(devAuth);
    }

    private resolveStubIdentity(devAuth: DevAuthConfig): Promise<AuthIdentity> {
        this.stubIdentity ??= this.usersService
            .upsertWithRole(devAuth.twitchId, devAuth.role)
            .then((user) => ({
                userId: String(user._id),
                twitchId: user.twitchId,
                role: user.role,
            }))
            .catch((error: unknown) => {
                this.stubIdentity = null;
                throw error;
            });
        return this.stubIdentity;
    }
}
