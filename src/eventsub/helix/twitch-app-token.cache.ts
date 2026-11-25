import type { FactoryProvider } from '@nestjs/common';
import { Clock } from 'src/auth/clock';
import { TWITCH_TOKEN_URL } from 'src/auth/twitch/http-twitch-oauth.client';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import type { EventSubConfig } from 'src/config/eventsub-config';
import { TwitchHelixError } from 'src/eventsub/helix/twitch-helix.client';
import {
    assertTwitchOk,
    HELIX_REQUEST_TIMEOUT_MS,
    readTwitchJson,
    sendTwitchRequest,
} from 'src/eventsub/helix/twitch-http';

export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const NOT_MANAGED_MESSAGE =
    'EventSub subscriptions are not managed in this environment';

const TOKEN_OPERATION = 'Twitch app token';
const MILLISECONDS_PER_SECOND = 1000;

export interface TwitchAppCredentials {
    clientId: string;
    clientSecret: string;
}

interface AppTokenResponse {
    access_token?: unknown;
    expires_in?: unknown;
}

interface CachedAppToken {
    accessToken: string;
    expiresAt: number;
}

// token solo in memoria, mai persistito né loggato; gli app token non si rinnovano: se ne chiede uno nuovo (D-13)
// istanze costruite da factory: EventSub dalla config gestita, la cancellazione dell'oste dalle credenziali del login (Phase 26 D-20)
export class TwitchAppTokenCache {
    private cached: CachedAppToken | null = null;
    private pending: Promise<string> | null = null;

    constructor(
        private readonly credentials: TwitchAppCredentials | null,
        private readonly clock: Clock,
        private readonly unavailableMessage: string = NOT_MANAGED_MESSAGE,
    ) {}

    getToken(): Promise<string> {
        if (!this.credentials) {
            return Promise.reject(
                new TwitchHelixError(this.unavailableMessage),
            );
        }
        if (this.cached && this.isFresh(this.cached)) {
            return Promise.resolve(this.cached.accessToken);
        }
        if (this.pending) return this.pending;
        this.pending = this.fetchToken(this.credentials).finally(() => {
            this.pending = null;
        });
        return this.pending;
    }

    // scarta solo il token rifiutato: un rinnovo concorrente già in cache resta valido
    invalidate(rejectedToken: string): void {
        if (this.cached?.accessToken !== rejectedToken) return;
        this.cached = null;
    }

    private isFresh(token: CachedAppToken): boolean {
        return (
            this.clock.now().getTime() <
            token.expiresAt - TOKEN_REFRESH_MARGIN_MS
        );
    }

    private async fetchToken(
        credentials: TwitchAppCredentials,
    ): Promise<string> {
        const response = await sendTwitchRequest(
            TOKEN_OPERATION,
            TWITCH_TOKEN_URL,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: credentials.clientId,
                    client_secret: credentials.clientSecret,
                    grant_type: 'client_credentials',
                }).toString(),
                signal: AbortSignal.timeout(HELIX_REQUEST_TIMEOUT_MS),
            },
        );
        assertTwitchOk(TOKEN_OPERATION, response);
        const body = await readTwitchJson<AppTokenResponse>(
            TOKEN_OPERATION,
            response,
        );
        const accessToken = requireAccessToken(body);
        this.cached = this.cacheEntry(accessToken, body.expires_in);
        return accessToken;
    }

    private cacheEntry(
        accessToken: string,
        expiresIn: unknown,
    ): CachedAppToken | null {
        if (typeof expiresIn !== 'number' || expiresIn <= 0) return null;
        return {
            accessToken,
            expiresAt:
                this.clock.now().getTime() +
                expiresIn * MILLISECONDS_PER_SECOND,
        };
    }
}

export const twitchAppTokenCacheProvider: FactoryProvider<TwitchAppTokenCache> =
    {
        provide: TwitchAppTokenCache,
        useFactory: (config: EventSubConfig, clock: Clock) =>
            new TwitchAppTokenCache(eventSubCredentialsOf(config), clock),
        inject: [EVENTSUB_CONFIG, Clock],
    };

function eventSubCredentialsOf(
    config: EventSubConfig,
): TwitchAppCredentials | null {
    if (config.mode !== 'managed') return null;
    return { clientId: config.clientId, clientSecret: config.clientSecret };
}

function requireAccessToken(body: AppTokenResponse): string {
    if (typeof body.access_token !== 'string' || body.access_token === '') {
        throw new TwitchHelixError(
            `${TOKEN_OPERATION} response is missing access_token`,
        );
    }
    return body.access_token;
}
