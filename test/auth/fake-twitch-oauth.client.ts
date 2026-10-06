import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import type {
    TwitchTokenInfo,
    TwitchTokens,
} from 'src/auth/twitch/twitch-oauth.client';
import { TEST_TWITCH_CLIENT_ID } from './test-auth-config';

export const FAKE_TWITCH_USER_ID = 'twitch-user-1';
export const FAKE_TWITCH_ACCESS_TOKEN = 'fake-twitch-access-token';
export const FAKE_TWITCH_REFRESH_TOKEN = 'fake-twitch-refresh-token';

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
    readonly exchangedCodes: string[] = [];
    readonly revokedTokens: string[] = [];

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

    reset(): void {
        this.tokenInfo = defaultTokenInfo();
        this.exchangeError = null;
        this.revokeError = null;
        this.exchangedCodes.length = 0;
        this.revokedTokens.length = 0;
    }
}
