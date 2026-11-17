export interface TwitchTokens {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
}

export interface TwitchTokenInfo {
    clientId: string;
    userId: string;
    login: string;
    scopes: string[];
}

export interface TwitchFollowQuery {
    accessToken: string;
    userId: string;
    broadcasterId: string;
}

export class TwitchOAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TwitchOAuthError';
    }
}

// Twitch non accetta più il refresh token (revocato, password cambiata, app scollegata): serve un nuovo login
export class TwitchRefreshRejectedError extends TwitchOAuthError {
    constructor(message: string) {
        super(message);
        this.name = 'TwitchRefreshRejectedError';
    }
}

export abstract class TwitchOAuthClient {
    abstract exchangeCode(code: string): Promise<TwitchTokens>;
    abstract validate(accessToken: string): Promise<TwitchTokenInfo>;
    abstract revoke(accessToken: string): Promise<void>;
    abstract refresh(refreshToken: string): Promise<TwitchTokens>;
    // con il token dell'utente (scope user:read:follows)
    abstract followsChannel(query: TwitchFollowQuery): Promise<boolean>;
    // con il token dello streamer (scope moderator:read:followers)
    abstract channelHasFollower(query: TwitchFollowQuery): Promise<boolean>;
}
