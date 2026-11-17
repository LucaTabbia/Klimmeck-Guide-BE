import { Injectable, Logger } from '@nestjs/common';
import { StreamerCredentialStore } from 'src/auth/channel-access/streamer-credential.store';
import { Clock } from 'src/auth/clock';
import {
    TwitchOAuthClient,
    TwitchRefreshRejectedError,
} from 'src/auth/twitch/twitch-oauth.client';

const MILLISECONDS_PER_SECOND = 1000;
const EXPIRY_MARGIN_MS = 60 * MILLISECONDS_PER_SECOND;

interface CachedAccessToken {
    accessToken: string;
    expiresAtMs: number;
}

// access token dello streamer tenuto solo in memoria; a DB resta il refresh token sigillato, che Twitch ruota a ogni rinnovo
@Injectable()
export class StreamerAccessTokenProvider {
    private readonly logger = new Logger(StreamerAccessTokenProvider.name);
    private cached: CachedAccessToken | null = null;
    private renewal: Promise<string | null> | null = null;

    constructor(
        private readonly store: StreamerCredentialStore,
        private readonly twitchOAuthClient: TwitchOAuthClient,
        private readonly clock: Clock,
    ) {}

    // null = lo streamer non ha (più) concesso moderator:read:followers
    async get(broadcasterId: string): Promise<string | null> {
        if (this.cached && this.cached.expiresAtMs > this.nowMs()) {
            return this.cached.accessToken;
        }
        this.renewal ??= this.renew(broadcasterId).finally(() => {
            this.renewal = null;
        });
        return this.renewal;
    }

    invalidate(): void {
        this.cached = null;
    }

    private async renew(broadcasterId: string): Promise<string | null> {
        const refreshToken = await this.store.load(broadcasterId);
        if (refreshToken === null) return null;
        try {
            const tokens = await this.twitchOAuthClient.refresh(refreshToken);
            if (tokens.refreshToken) {
                await this.store.save(broadcasterId, tokens.refreshToken);
            }
            this.cached = {
                accessToken: tokens.accessToken,
                expiresAtMs:
                    this.nowMs() +
                    tokens.expiresIn * MILLISECONDS_PER_SECOND -
                    EXPIRY_MARGIN_MS,
            };
            return tokens.accessToken;
        } catch (failure) {
            if (!(failure instanceof TwitchRefreshRejectedError)) throw failure;
            await this.store.clear(broadcasterId);
            this.logger.warn(
                'Twitch rejected the streamer refresh token: the channel access re-check is off until the streamer logs in again with moderator:read:followers',
            );
            return null;
        }
    }

    private nowMs(): number {
        return this.clock.now().getTime();
    }
}
