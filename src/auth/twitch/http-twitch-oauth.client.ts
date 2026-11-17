import { Inject, Injectable } from '@nestjs/common';
import {
    TwitchOAuthClient,
    TwitchOAuthError,
    TwitchRefreshRejectedError,
} from 'src/auth/twitch/twitch-oauth.client';
import type {
    TwitchFollowQuery,
    TwitchTokenInfo,
    TwitchTokens,
} from 'src/auth/twitch/twitch-oauth.client';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig, TwitchOAuthConfig } from 'src/config/auth-config';

export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
export const TWITCH_VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
export const TWITCH_REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';
export const TWITCH_FOLLOWED_CHANNELS_URL =
    'https://api.twitch.tv/helix/channels/followed';
export const TWITCH_CHANNEL_FOLLOWERS_URL =
    'https://api.twitch.tv/helix/channels/followers';
export const TWITCH_REQUEST_TIMEOUT_MS = 5000;
export const TWITCH_REVOKE_TIMEOUT_MS = 2000;

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };
const REJECTED_REFRESH_STATUSES: readonly number[] = [400, 401];

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

interface TwitchFollowListResponse {
    data?: unknown;
}

type TwitchFollowEntry = {
    broadcaster_id?: unknown;
    user_id?: unknown;
} | null;

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

    async refresh(refreshToken: string): Promise<TwitchTokens> {
        const twitch = this.requireTwitch();
        const operation = 'Twitch token refresh';
        const response = await send(operation, TWITCH_TOKEN_URL, {
            method: 'POST',
            headers: FORM_HEADERS,
            body: new URLSearchParams({
                client_id: twitch.clientId,
                client_secret: twitch.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }).toString(),
            signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
        });
        if (REJECTED_REFRESH_STATUSES.includes(response.status)) {
            throw new TwitchRefreshRejectedError(
                failedWithStatus(operation, response),
            );
        }
        assertOk(operation, response);
        return toTwitchTokens(
            await readJson<TwitchTokenResponse>(response, 'Twitch token'),
        );
    }

    async followsChannel({
        accessToken,
        userId,
        broadcasterId,
    }: TwitchFollowQuery): Promise<boolean> {
        const follows = await this.listFollows(
            'Twitch follow check',
            TWITCH_FOLLOWED_CHANNELS_URL,
            { user_id: userId, broadcaster_id: broadcasterId },
            accessToken,
        );
        return follows.some(
            (channel) => channel?.broadcaster_id === broadcasterId,
        );
    }

    // senza lo scope o con il token di un altro utente Helix risponde 200 con la lista vuota: il token va quindi
    // accettato solo da chi ha verificato scope e proprietario (TwitchLoginService)
    async channelHasFollower({
        accessToken,
        userId,
        broadcasterId,
    }: TwitchFollowQuery): Promise<boolean> {
        const followers = await this.listFollows(
            'Twitch follower check',
            TWITCH_CHANNEL_FOLLOWERS_URL,
            { broadcaster_id: broadcasterId, user_id: userId },
            accessToken,
        );
        return followers.some((follower) => follower?.user_id === userId);
    }

    private async listFollows(
        operation: string,
        endpoint: string,
        query: Record<string, string>,
        accessToken: string,
    ): Promise<TwitchFollowEntry[]> {
        const twitch = this.requireTwitch();
        const url = new URL(endpoint);
        url.search = new URLSearchParams(query).toString();
        const response = await request(operation, url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Client-Id': twitch.clientId,
            },
            signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
        });
        const body = await readJson<TwitchFollowListResponse>(
            response,
            operation,
        );
        if (!Array.isArray(body.data)) {
            throw new TwitchOAuthError(`${operation} response is missing data`);
        }
        return body.data as TwitchFollowEntry[];
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
    const response = await send(operation, url, init);
    assertOk(operation, response);
    return response;
}

async function send(
    operation: string,
    url: string,
    init: RequestInit,
): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch {
        throw new TwitchOAuthError(`${operation} request failed`);
    }
}

function assertOk(operation: string, response: Response): void {
    if (!response.ok) {
        throw new TwitchOAuthError(failedWithStatus(operation, response));
    }
}

function failedWithStatus(operation: string, response: Response): string {
    return `${operation} failed with status ${response.status}`;
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
