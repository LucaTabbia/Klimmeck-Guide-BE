import type { TwitchLogin } from 'src/auth/twitch/twitch-login-name';
import {
    TwitchUserDirectory,
    TwitchUserLookupError,
} from 'src/auth/twitch/twitch-user-directory';

// sostituisce HttpTwitchUserDirectory nei test: nessuna chiamata di rete, il nome arriva già normalizzato dal servizio (IN-03)
export class FakeTwitchUserDirectory extends TwitchUserDirectory {
    readonly idsByLogin = new Map<string, string>();
    unreachable = false;
    readonly lookedUpLogins: string[] = [];

    userIdOfLogin(login: TwitchLogin): Promise<string | null> {
        this.lookedUpLogins.push(login);
        if (this.unreachable) {
            return Promise.reject(new TwitchUserLookupError());
        }
        return Promise.resolve(this.idsByLogin.get(login) ?? null);
    }

    reset(): void {
        this.idsByLogin.clear();
        this.unreachable = false;
        this.lookedUpLogins.length = 0;
    }
}
