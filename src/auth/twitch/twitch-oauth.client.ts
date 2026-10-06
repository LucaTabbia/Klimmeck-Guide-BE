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

export class TwitchOAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TwitchOAuthError';
    }
}

export abstract class TwitchOAuthClient {
    abstract exchangeCode(code: string): Promise<TwitchTokens>;
    abstract validate(accessToken: string): Promise<TwitchTokenInfo>;
    abstract revoke(accessToken: string): Promise<void>;
}
