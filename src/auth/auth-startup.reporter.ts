import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig, DevAuthConfig } from 'src/config/auth-config';

const TWITCH_NOT_CONFIGURED_WARNING =
    'Twitch OAuth not configured (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET / TWITCH_REDIRECT_URI): GET /auth/twitch/start redirects with error=twitch_not_configured';

// i warning non interpolano mai il token dev né il client secret Twitch
@Injectable()
export class AuthStartupReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger('Auth');

    constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

    onApplicationBootstrap(): void {
        if (this.config.devAuth) this.warnDevAuthBypass(this.config.devAuth);
        if (!this.config.twitch)
            this.logger.warn(TWITCH_NOT_CONFIGURED_WARNING);
    }

    private warnDevAuthBypass(devAuth: DevAuthConfig): void {
        this.logger.warn(
            `DEV AUTH BYPASS ENABLED — bearer DEV_AUTH_ACCESS_TOKEN resolves to twitchId=${devAuth.twitchId} role=${devAuth.role}. Never enable outside local development.`,
        );
    }
}
