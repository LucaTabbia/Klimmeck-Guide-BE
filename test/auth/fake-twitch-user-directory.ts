import { normalizedTwitchLoginOf } from 'src/auth/twitch/twitch-login-name';
import {
    TwitchUserDirectory,
    TwitchUserLookupError,
} from 'src/auth/twitch/twitch-user-directory';

// sostituisce HttpTwitchUserDirectory nei test: nessuna chiamata di rete, nomi normalizzati come l'adattatore vero
export class FakeTwitchUserDirectory extends TwitchUserDirectory {
    readonly idsByLogin = new Map<string, string>();
    unreachable = false;
    readonly lookedUpLogins: string[] = [];

    userIdOfLogin(login: string): Promise<string | null> {
        this.lookedUpLogins.push(login);
        const normalized = normalizedTwitchLoginOf(login);
        if (normalized === null) return Promise.resolve(null);
        if (this.unreachable) {
            return Promise.reject(new TwitchUserLookupError());
        }
        return Promise.resolve(this.idsByLogin.get(normalized) ?? null);
    }

    reset(): void {
        this.idsByLogin.clear();
        this.unreachable = false;
        this.lookedUpLogins.length = 0;
    }
}
