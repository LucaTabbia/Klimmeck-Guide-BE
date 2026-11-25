import type { FactoryProvider } from '@nestjs/common';
import { Clock } from 'src/auth/clock';
import { normalizedTwitchLoginOf } from 'src/auth/twitch/twitch-login-name';
import {
    TWITCH_USER_LOOKUP_FAILED_MESSAGE,
    TwitchUserDirectory,
    TwitchUserLookupError,
} from 'src/auth/twitch/twitch-user-directory';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig, TwitchOAuthConfig } from 'src/config/auth-config';
import { TWITCH_USER_ID_PATTERN } from 'src/config/eventsub-config';
import { TwitchAppTokenCache } from 'src/eventsub/helix/twitch-app-token.cache';
import type { TwitchAppCredentials } from 'src/eventsub/helix/twitch-app-token.cache';
import { TwitchHelixError } from 'src/eventsub/helix/twitch-helix.client';
import {
    assertTwitchOk,
    HELIX_REQUEST_TIMEOUT_MS,
    readTwitchJson,
    sendTwitchRequest,
} from 'src/eventsub/helix/twitch-http';

export const HELIX_USERS_URL = 'https://api.twitch.tv/helix/users';
export const USER_LOOKUP_NOT_CONFIGURED_MESSAGE =
    'Twitch user lookup is not configured';

const LOOKUP_OPERATION = 'Helix get users';
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

interface HelixUsersResponse {
    data?: unknown;
}

interface AuthorizedResponse {
    response: Response;
    accessToken: string;
}

// nessun logger: il nome utente cercato non finisce nei log (Phase 26 D-25); i messaggi di TwitchHelixError portano solo operazione e status
export class HttpTwitchUserDirectory extends TwitchUserDirectory {
    constructor(
        private readonly clientId: string | null,
        private readonly tokens: TwitchAppTokenCache,
    ) {
        super();
    }

    async userIdOfLogin(rawLogin: string): Promise<string | null> {
        const login = normalizedTwitchLoginOf(rawLogin);
        if (login === null) return null;
        try {
            return await this.lookUp(login);
        } catch (error) {
            throw lookupErrorOf(error);
        }
    }

    private async lookUp(login: string): Promise<string | null> {
        const url = new URL(HELIX_USERS_URL);
        url.searchParams.set('login', login);
        const response = await this.authorizedRequest(url);
        if (response.status === HTTP_BAD_REQUEST) {
            await discardBody(response);
            return null;
        }
        assertTwitchOk(LOOKUP_OPERATION, response);
        const body = await readTwitchJson<HelixUsersResponse>(
            LOOKUP_OPERATION,
            response,
        );
        return userIdOf(body.data);
    }

    // un 401 indica un app token revocato o scaduto: se ne chiede uno nuovo e si ritenta una sola volta
    private async authorizedRequest(url: URL): Promise<Response> {
        const { response, accessToken } = await this.sendAuthorized(url);
        if (response.status !== HTTP_UNAUTHORIZED) return response;
        await discardBody(response);
        this.tokens.invalidate(accessToken);
        const retry = await this.sendAuthorized(url);
        return retry.response;
    }

    private async sendAuthorized(url: URL): Promise<AuthorizedResponse> {
        const clientId = this.requireClientId();
        const accessToken = await this.tokens.getToken();
        const response = await sendTwitchRequest(
            LOOKUP_OPERATION,
            url.toString(),
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Client-Id': clientId,
                },
                signal: AbortSignal.timeout(HELIX_REQUEST_TIMEOUT_MS),
            },
        );
        return { response, accessToken };
    }

    private requireClientId(): string {
        if (this.clientId === null) {
            throw new TwitchHelixError(USER_LOOKUP_NOT_CONFIGURED_MESSAGE);
        }
        return this.clientId;
    }
}

// istanza propria del token app dalle credenziali del login: quella di EventSub vale solo in modalità gestita (Phase 26 D-20)
export const twitchUserDirectoryProvider: FactoryProvider<TwitchUserDirectory> =
    {
        provide: TwitchUserDirectory,
        useFactory: (config: AuthConfig, clock: Clock) =>
            new HttpTwitchUserDirectory(
                config.twitch?.clientId ?? null,
                new TwitchAppTokenCache(
                    loginCredentialsOf(config.twitch),
                    clock,
                    USER_LOOKUP_NOT_CONFIGURED_MESSAGE,
                ),
            ),
        inject: [AUTH_CONFIG, Clock],
    };

function loginCredentialsOf(
    twitch: TwitchOAuthConfig | null,
): TwitchAppCredentials | null {
    if (twitch === null) return null;
    return { clientId: twitch.clientId, clientSecret: twitch.clientSecret };
}

function userIdOf(data: unknown): string | null {
    if (!Array.isArray(data)) {
        throw new TwitchHelixError(`${LOOKUP_OPERATION} response is malformed`);
    }
    if (data.length === 0) return null;
    const [first] = data as unknown[];
    const id =
        typeof first === 'object' && first !== null
            ? (first as { id?: unknown }).id
            : undefined;
    if (typeof id !== 'string' || !TWITCH_USER_ID_PATTERN.test(id)) {
        throw new TwitchHelixError(`${LOOKUP_OPERATION} response is malformed`);
    }
    return id;
}

// solo il messaggio di TwitchHelixError (operazione e status); ogni altro errore resta anonimo
function lookupErrorOf(error: unknown): TwitchUserLookupError {
    if (error instanceof TwitchHelixError) {
        return new TwitchUserLookupError(
            `${TWITCH_USER_LOOKUP_FAILED_MESSAGE}: ${error.message}`,
        );
    }
    return new TwitchUserLookupError();
}

async function discardBody(response: Response): Promise<void> {
    await response.body?.cancel().catch(() => undefined);
}
