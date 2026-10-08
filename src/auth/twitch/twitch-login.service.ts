import { Inject, Injectable, Logger } from '@nestjs/common';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { CODE_CHALLENGE_PATTERN } from 'src/auth/crypto/token-crypto';
import {
    buildAppErrorRedirect,
    buildAppTicketRedirect,
} from 'src/auth/twitch/app-redirect-url';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import { buildTwitchAuthorizeUrl } from 'src/auth/twitch/twitch-authorize-url';
import { TwitchLoginErrorCode } from 'src/auth/twitch/twitch-login-error-code.enum';
import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig, TwitchOAuthConfig } from 'src/config/auth-config';
import { UsersService } from 'src/users/users.service';

export interface TwitchCallbackQuery {
    code?: string;
    state?: string;
    error?: string;
}

// ogni esito è un URL di redirect verso l'app (mai una pagina d'errore); la base arriva solo dalla config
@Injectable()
export class TwitchLoginService {
    private readonly logger = new Logger(TwitchLoginService.name);

    constructor(
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
        private readonly oauthStateService: OAuthStateService,
        private readonly twitchOAuthClient: TwitchOAuthClient,
        private readonly usersService: UsersService,
        private readonly loginTicketService: LoginTicketService,
    ) {}

    async buildStartRedirectUrl(challenge: unknown): Promise<string> {
        const twitch = this.config.twitch;
        if (!twitch) {
            return this.errorRedirect(
                TwitchLoginErrorCode.TWITCH_NOT_CONFIGURED,
            );
        }
        if (!isCodeChallenge(challenge)) {
            return this.errorRedirect(TwitchLoginErrorCode.INVALID_REQUEST);
        }
        return buildTwitchAuthorizeUrl(
            twitch,
            await this.oauthStateService.sign(challenge),
        );
    }

    // lo state è verificato prima di qualsiasi altra azione (anti-CSRF)
    async handleCallback({
        code,
        state,
        error,
    }: TwitchCallbackQuery): Promise<string> {
        const twitch = this.config.twitch;
        if (!twitch) {
            return this.errorRedirect(
                TwitchLoginErrorCode.TWITCH_NOT_CONFIGURED,
            );
        }
        const challenge = await this.oauthStateService.verifyChallenge(state);
        if (challenge === null) {
            return this.errorRedirect(TwitchLoginErrorCode.INVALID_STATE);
        }
        if (error !== undefined) {
            return this.errorRedirect(TwitchLoginErrorCode.ACCESS_DENIED);
        }
        if (typeof code !== 'string' || code === '') {
            return this.errorRedirect(TwitchLoginErrorCode.INVALID_REQUEST);
        }
        try {
            return await this.completeLogin(code, challenge, twitch);
        } catch (failure) {
            // solo il nome dell'errore: il message potrebbe contenere dati sensibili
            this.logger.warn(
                `Twitch login failed: ${failure instanceof Error ? failure.name : 'unknown'}`,
            );
            return this.errorRedirect(
                TwitchLoginErrorCode.TWITCH_EXCHANGE_FAILED,
            );
        }
    }

    // i token Twitch non vengono mai persistiti: servono solo a leggere l'identità e sono revocati subito (D-05)
    private async completeLogin(
        code: string,
        challenge: string,
        twitch: TwitchOAuthConfig,
    ): Promise<string> {
        const tokens = await this.twitchOAuthClient.exchangeCode(code);
        try {
            const tokenInfo = await this.twitchOAuthClient.validate(
                tokens.accessToken,
            );
            if (tokenInfo.clientId !== twitch.clientId) {
                return this.errorRedirect(
                    TwitchLoginErrorCode.TWITCH_CLIENT_MISMATCH,
                );
            }
            const user = await this.usersService.findOrCreateByTwitchId(
                tokenInfo.userId,
            );
            const ticket = await this.loginTicketService.issue(
                String(user._id),
                challenge,
            );
            return buildAppTicketRedirect(
                this.config.appAuthRedirectUrl,
                ticket,
            );
        } finally {
            await this.revokeQuietly(tokens.accessToken);
        }
    }

    private async revokeQuietly(accessToken: string): Promise<void> {
        try {
            await this.twitchOAuthClient.revoke(accessToken);
        } catch {
            this.logger.warn('Twitch token revoke failed');
        }
    }

    private errorRedirect(code: TwitchLoginErrorCode): string {
        return buildAppErrorRedirect(this.config.appAuthRedirectUrl, code);
    }
}

function isCodeChallenge(challenge: unknown): challenge is string {
    return (
        typeof challenge === 'string' && CODE_CHALLENGE_PATTERN.test(challenge)
    );
}
