import { Inject, Injectable } from '@nestjs/common';
import {
    TwitchOAuthClient,
    TwitchOAuthError,
} from 'src/auth/twitch/twitch-oauth.client';
import type {
    TwitchTokenInfo,
    TwitchTokens,
} from 'src/auth/twitch/twitch-oauth.client';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig, TwitchOAuthConfig } from 'src/config/auth-config';

export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
export const TWITCH_VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
export const TWITCH_REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';
export const TWITCH_REQUEST_TIMEOUT_MS = 5000;
export const TWITCH_REVOKE_TIMEOUT_MS = 2000;

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

interface TwitchTokenResponse {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
}

interface TwitchValidateResponse {
    client_id?: unknown;
    login?: unknown;
    scopes?: unknown;
    user_id?: unknown;
}

@Injectable()
export class HttpTwitchOAuthClient extends TwitchOAuthClient {
    constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
        super();
    }

    async exchangeCode(code: string): Promise<TwitchTokens> {
        const twitch = this.requireTwitch();
        const response = await request(
            'Twitch token exchange',
            TWITCH_TOKEN_URL,
            {
                method: 'POST',
                headers: FORM_HEADERS,
                body: new URLSearchParams({
                    client_id: twitch.clientId,
                    client_secret: twitch.clientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: twitch.redirectUri,
                }).toString(),
                signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
            },
        );
        return toTwitchTokens(
            await readJson<TwitchTokenResponse>(response, 'Twitch token'),
        );
    }

    async validate(accessToken: string): Promise<TwitchTokenInfo> {
        this.requireTwitch();
        const response = await request('Twitch validate', TWITCH_VALIDATE_URL, {
            method: 'GET',
            headers: { Authorization: `OAuth ${accessToken}` },
            signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
        });
        return toTwitchTokenInfo(
            await readJson<TwitchValidateResponse>(response, 'Twitch validate'),
        );
    }

    async revoke(accessToken: string): Promise<void> {
        const twitch = this.requireTwitch();
        await request('Twitch revoke', TWITCH_REVOKE_URL, {
            method: 'POST',
            headers: FORM_HEADERS,
            body: new URLSearchParams({
                client_id: twitch.clientId,
                token: accessToken,
            }).toString(),
            signal: AbortSignal.timeout(TWITCH_REVOKE_TIMEOUT_MS),
        });
    }

    private requireTwitch(): TwitchOAuthConfig {
        if (!this.config.twitch) {
            throw new TwitchOAuthError('Twitch OAuth is not configured');
        }
        return this.config.twitch;
    }
}

// i messaggi d'errore riportano solo operazione e status: mai code, token o client_secret
async function request(
    operation: string,
    url: string,
    init: RequestInit,
): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch {
        throw new TwitchOAuthError(`${operation} request failed`);
    }
    if (!response.ok) {
        throw new TwitchOAuthError(
            `${operation} failed with status ${response.status}`,
        );
    }
    return response;
}

async function readJson<T>(response: Response, source: string): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw new TwitchOAuthError(`${source} response is not valid JSON`);
    }
}

function toTwitchTokens(body: TwitchTokenResponse): TwitchTokens {
    if (typeof body.access_token !== 'string' || body.access_token === '') {
        throw new TwitchOAuthError(
            'Twitch token response is missing access_token',
        );
    }
    return {
        accessToken: body.access_token,
        refreshToken:
            typeof body.refresh_token === 'string'
                ? body.refresh_token
                : undefined,
        expiresIn: typeof body.expires_in === 'number' ? body.expires_in : 0,
    };
}

function toTwitchTokenInfo(body: TwitchValidateResponse): TwitchTokenInfo {
    if (
        typeof body.user_id !== 'string' ||
        typeof body.client_id !== 'string'
    ) {
        throw new TwitchOAuthError(
            'Twitch validate response is missing user_id',
        );
    }
    return {
        clientId: body.client_id,
        userId: body.user_id,
        login: typeof body.login === 'string' ? body.login : '',
        scopes: Array.isArray(body.scopes) ? body.scopes.filter(isString) : [],
    };
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}
