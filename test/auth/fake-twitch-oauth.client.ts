import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import type {
    TwitchFollowQuery,
    TwitchTokenInfo,
    TwitchTokens,
} from 'src/auth/twitch/twitch-oauth.client';
import { TEST_TWITCH_CLIENT_ID } from './test-auth-config';

export const FAKE_TWITCH_USER_ID = 'twitch-user-1';
export const FAKE_TWITCH_ACCESS_TOKEN = 'fake-twitch-access-token';
export const FAKE_TWITCH_REFRESH_TOKEN = 'fake-twitch-refresh-token';
export const FAKE_STREAMER_ACCESS_TOKEN = 'fake-streamer-access-token';
export const FAKE_STREAMER_REFRESH_TOKEN = 'fake-streamer-refresh-token';

function defaultTokenInfo(): TwitchTokenInfo {
    return {
        clientId: TEST_TWITCH_CLIENT_ID,
        userId: FAKE_TWITCH_USER_ID,
        login: 'fake-tester',
        scopes: [],
    };
}

// sostituisce HttpTwitchOAuthClient nei test: nessuna chiamata di rete, nessuna chiave Twitch
export class FakeTwitchOAuthClient extends TwitchOAuthClient {
    tokenInfo: TwitchTokenInfo = defaultTokenInfo();
    exchangeError: Error | null = null;
    revokeError: Error | null = null;
    isFollowing = true;
    followError: Error | null = null;
    readonly exchangedCodes: string[] = [];
    readonly revokedTokens: string[] = [];
    readonly followQueries: TwitchFollowQuery[] = [];
    isFollower = true;
    followerError: Error | null = null;
    refreshError: Error | null = null;
    streamerTokenSeconds = 3600;
    readonly followerQueries: TwitchFollowQuery[] = [];
    readonly refreshedWith: string[] = [];

    exchangeCode(code: string): Promise<TwitchTokens> {
        this.exchangedCodes.push(code);
        if (this.exchangeError) return Promise.reject(this.exchangeError);
        return Promise.resolve({
            accessToken: FAKE_TWITCH_ACCESS_TOKEN,
            refreshToken: FAKE_TWITCH_REFRESH_TOKEN,
            expiresIn: 3600,
        });
    }

    validate(): Promise<TwitchTokenInfo> {
        return Promise.resolve(this.tokenInfo);
    }

    revoke(accessToken: string): Promise<void> {
        this.revokedTokens.push(accessToken);
        if (this.revokeError) return Promise.reject(this.revokeError);
        return Promise.resolve();
    }

    followsChannel(query: TwitchFollowQuery): Promise<boolean> {
        this.followQueries.push(query);
        if (this.followError) return Promise.reject(this.followError);
        return Promise.resolve(this.isFollowing);
    }

    refresh(refreshToken: string): Promise<TwitchTokens> {
        this.refreshedWith.push(refreshToken);
        if (this.refreshError) return Promise.reject(this.refreshError);
        return Promise.resolve({
            accessToken: FAKE_STREAMER_ACCESS_TOKEN,
            refreshToken: FAKE_STREAMER_REFRESH_TOKEN,
            expiresIn: this.streamerTokenSeconds,
        });
    }

    channelHasFollower(query: TwitchFollowQuery): Promise<boolean> {
        this.followerQueries.push(query);
        if (this.followerError) return Promise.reject(this.followerError);
        return Promise.resolve(this.isFollower);
    }

    reset(): void {
        this.tokenInfo = defaultTokenInfo();
        this.exchangeError = null;
        this.revokeError = null;
        this.isFollowing = true;
        this.followError = null;
        this.exchangedCodes.length = 0;
        this.revokedTokens.length = 0;
        this.followQueries.length = 0;
        this.isFollower = true;
        this.followerError = null;
        this.refreshError = null;
        this.streamerTokenSeconds = 3600;
        this.followerQueries.length = 0;
        this.refreshedWith.length = 0;
    }
}
