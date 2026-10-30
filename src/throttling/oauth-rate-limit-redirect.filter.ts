import { Catch, HttpStatus, Inject } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { buildAppErrorRedirect } from 'src/auth/twitch/app-redirect-url';
import { TwitchLoginErrorCode } from 'src/auth/twitch/twitch-login-error-code.enum';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';
import { TooManyRequestsException } from 'src/throttling/too-many-requests.exception';

// le route OAuth sono navigazioni del browser: ogni esito torna all'app come redirect, mai un JSON 429 (C6)
@Catch(TooManyRequestsException)
export class OAuthRateLimitRedirectFilter implements ExceptionFilter {
    constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

    catch(_exception: TooManyRequestsException, host: ArgumentsHost): void {
        host.switchToHttp()
            .getResponse<Response>()
            .redirect(
                HttpStatus.FOUND,
                buildAppErrorRedirect(
                    this.config.appAuthRedirectUrl,
                    TwitchLoginErrorCode.RATE_LIMITED,
                ),
            );
    }
}
