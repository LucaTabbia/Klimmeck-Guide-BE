import {
    HELIX_USERS_URL,
    HttpTwitchUserDirectory,
    twitchUserDirectoryProvider,
} from 'src/auth/twitch/http-twitch-user-directory';
import {
    TwitchUserDirectory,
    TwitchUserLookupError,
} from 'src/auth/twitch/twitch-user-directory';
import { TwitchAppTokenCache } from 'src/eventsub/helix/twitch-app-token.cache';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildTestAuthConfig,
    TEST_TWITCH_CLIENT_ID,
} from '../../../test/auth/test-auth-config';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERNAME = 'some_user';
const CLIENT_SECRET = 'login-client-secret';
const SECRET_FRAGMENTS = [USERNAME, 'app-token', CLIENT_SECRET];

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function usersPage(data: unknown[]): Response {
    return jsonResponse(200, { data });
}

describe('HttpTwitchUserDirectory', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let helixResponses: Array<Response | Error>;
    let tokenRequests: number;
    let clock: FixedClock;

    beforeEach(() => {
        helixResponses = [];
        tokenRequests = 0;
        clock = new FixedClock(new Date('2026-11-25T12:00:00.000Z'));
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockImplementation((input: string | URL | Request) => {
                const url =
                    input instanceof Request ? input.url : input.toString();
                if (url === TOKEN_URL) {
                    tokenRequests += 1;
                    return Promise.resolve(
                        jsonResponse(200, {
                            access_token: `app-token-${tokenRequests}`,
                            expires_in: 3600,
                            token_type: 'bearer',
                        }),
                    );
                }
                const next = url.startsWith(HELIX_USERS_URL)
                    ? helixResponses.shift()
                    : undefined;
                if (next instanceof Error) return Promise.reject(next);
                if (!next) {
                    return Promise.reject(new Error('Unexpected network call'));
                }
                return Promise.resolve(next);
            });
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    function buildDirectory(): HttpTwitchUserDirectory {
        const tokens = new TwitchAppTokenCache(
            { clientId: 'login-client-id', clientSecret: CLIENT_SECRET },
            clock,
        );
        return new HttpTwitchUserDirectory('login-client-id', tokens);
    }

    function helixCalls(): Array<{ url: string; init: RequestInit }> {
        return fetchSpy.mock.calls
            .map(([url, init]) => ({
                url: url instanceof Request ? url.url : url.toString(),
                init: init ?? {},
            }))
            .filter(({ url }) => url !== TOKEN_URL);
    }

    async function lookupErrorOf(
        promise: Promise<unknown>,
    ): Promise<TwitchUserLookupError> {
        const error = await promise.then(
            () => {
                throw new Error('expected a rejection');
            },
            (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(TwitchUserLookupError);
        const lookupError = error as TwitchUserLookupError;
        for (const fragment of SECRET_FRAGMENTS) {
            expect(lookupError.message).not.toContain(fragment);
        }
        return lookupError;
    }

    it('answers the Twitch id of an existing username (D-15)', async () => {
        helixResponses.push(usersPage([{ id: '123', login: USERNAME }]));

        await expect(buildDirectory().userIdOfLogin(USERNAME)).resolves.toBe(
            '123',
        );

        const calls = helixCalls();
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${HELIX_USERS_URL}?login=${USERNAME}`);
        expect(calls[0].init.method).toBe('GET');
        expect(calls[0].init.headers).toMatchObject({
            'Client-Id': 'login-client-id',
            Authorization: 'Bearer app-token-1',
        });
        expect(calls[0].init.signal).toBeDefined();
    });

    it('normalises the username before asking Twitch (D-15)', async () => {
        helixResponses.push(usersPage([{ id: '123', login: USERNAME }]));

        await expect(
            buildDirectory().userIdOfLogin(' @Some_User '),
        ).resolves.toBe('123');

        expect(helixCalls()[0].url).toBe(
            `${HELIX_USERS_URL}?login=${USERNAME}`,
        );
    });

    it.each<[string, string]>([
        ['of the wrong shape', 'user-name'],
        ['longer than 64 characters', 'a'.repeat(65)],
    ])(
        'answers null for a username %s without calling Twitch (D-15)',
        async (_label, raw) => {
            await expect(
                buildDirectory().userIdOfLogin(raw),
            ).resolves.toBeNull();
            expect(fetchSpy).not.toHaveBeenCalled();
        },
    );

    it('answers null for an unknown username (D-15)', async () => {
        helixResponses.push(usersPage([]), jsonResponse(400, {}));
        const directory = buildDirectory();

        await expect(directory.userIdOfLogin(USERNAME)).resolves.toBeNull();
        await expect(directory.userIdOfLogin(USERNAME)).resolves.toBeNull();
        expect(helixCalls()).toHaveLength(2);
    });

    it('retries once with a new app token after a 401 (D-20)', async () => {
        helixResponses.push(
            jsonResponse(401, {}),
            usersPage([{ id: '123', login: USERNAME }]),
        );

        await expect(buildDirectory().userIdOfLogin(USERNAME)).resolves.toBe(
            '123',
        );

        expect(tokenRequests).toBe(2);
        const calls = helixCalls();
        expect(calls).toHaveLength(2);
        expect(calls[1].init.headers).toMatchObject({
            Authorization: 'Bearer app-token-2',
        });
    });

    it('reports Twitch unreachable after a second 401 (D-15)', async () => {
        helixResponses.push(jsonResponse(401, {}), jsonResponse(401, {}));

        await lookupErrorOf(buildDirectory().userIdOfLogin(USERNAME));

        expect(helixCalls()).toHaveLength(2);
    });

    it('reports Twitch unreachable on a 5xx (D-15)', async () => {
        helixResponses.push(jsonResponse(503, { message: USERNAME }));

        await lookupErrorOf(buildDirectory().userIdOfLogin(USERNAME));
    });

    it('reports Twitch unreachable on a network failure (D-15)', async () => {
        helixResponses.push(new TypeError(`fetch failed for ${USERNAME}`));

        await lookupErrorOf(buildDirectory().userIdOfLogin(USERNAME));
    });

    it('reports Twitch unreachable on a malformed answer (D-15)', async () => {
        helixResponses.push(usersPage([{ id: 42, login: USERNAME }]));

        await lookupErrorOf(buildDirectory().userIdOfLogin(USERNAME));
    });

    it('reports Twitch unreachable without credentials, without calling Twitch (D-20)', async () => {
        const directory = twitchUserDirectoryProvider.useFactory(
            buildTestAuthConfig({ twitch: null }),
            clock,
        ) as TwitchUserDirectory;

        await lookupErrorOf(directory.userIdOfLogin(USERNAME));

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('builds the directory from the login credentials (D-20)', async () => {
        helixResponses.push(usersPage([{ id: '123', login: USERNAME }]));
        const directory = twitchUserDirectoryProvider.useFactory(
            buildTestAuthConfig(),
            clock,
        ) as TwitchUserDirectory;

        await expect(directory.userIdOfLogin(USERNAME)).resolves.toBe('123');

        const [, tokenInit] = fetchSpy.mock.calls[0];
        const form = new URLSearchParams(tokenInit?.body as string);
        expect(form.get('client_id')).toBe(TEST_TWITCH_CLIENT_ID);
        expect(form.get('client_secret')).toBe('test-client-secret');
        expect(helixCalls()[0].init.headers).toMatchObject({
            'Client-Id': TEST_TWITCH_CLIENT_ID,
        });
    });

    it('never puts the username in an error message (D-25)', async () => {
        const failures: Array<Response | Error> = [
            jsonResponse(500, { message: USERNAME }),
            jsonResponse(403, { message: USERNAME }),
            new Error(USERNAME),
            new Response('not json', { status: 200 }),
        ];
        const directory = buildDirectory();

        for (const failure of failures) {
            helixResponses.push(failure);
            const error = await lookupErrorOf(
                directory.userIdOfLogin(USERNAME),
            );
            expect(error.message).not.toContain(USERNAME);
        }
    });
});
