import type { TwitchLogin } from 'src/auth/twitch/twitch-login-name';

export const TWITCH_USER_LOOKUP_FAILED_MESSAGE = 'Twitch user lookup failed';

// messaggi fissi: mai il nome utente cercato, il token o il client secret (Phase 26 D-25)
export class TwitchUserLookupError extends Error {
    constructor(message: string = TWITCH_USER_LOOKUP_FAILED_MESSAGE) {
        super(message);
        this.name = 'TwitchUserLookupError';
    }
}

export abstract class TwitchUserDirectory {
    // login già normalizzato dal chiamante (IN-03); null = nessun utente Twitch con quel nome; TwitchUserLookupError = Twitch non raggiungibile
    abstract userIdOfLogin(login: TwitchLogin): Promise<string | null>;
}
