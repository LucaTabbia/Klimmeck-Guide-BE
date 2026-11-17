import { HttpTwitchOAuthClient } from 'src/auth/twitch/http-twitch-oauth.client';
import {
    TwitchOAuthError,
    TwitchRefreshRejectedError,
} from 'src/auth/twitch/twitch-oauth.client';
import {
    buildTestAuthConfig,
    TEST_TWITCH_CLIENT_ID,
} from '../../../test/auth/test-auth-config';

const TEST_CLIENT_SECRET = 'test-client-secret';
const TEST_REDIRECT_URI = 'http://localhost:3000/auth/twitch/callback';
const AUTH_CODE = 'the-code';

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function emptyResponse(status: number): Response {
    return new Response(null, { status });
}

describe('HttpTwitchOAuthClient', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let client: HttpTwitchOAuthClient;

    beforeEach(() => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockRejectedValue(new Error('Unexpected network call'));
        client = new HttpTwitchOAuthClient(buildTestAuthConfig());
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    function lastRequest(): { url: string; init: RequestInit } {
        const [url, init] = fetchSpy.mock.calls[0];
        return { url: String(url), init: init ?? {} };
    }

    function lastForm(): URLSearchParams {
        return new URLSearchParams(lastRequest().init.body as string);
    }

    describe('exchangeCode', () => {
        it('posts a form-urlencoded authorization_code grant with the configured redirect_uri', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, {
                    access_token: 'at',
                    refresh_token: 'rt',
                    expires_in: 3600,
                    scope: [],
                    token_type: 'bearer',
                }),
            );

            const tokens = await client.exchangeCode(AUTH_CODE);

            expect(tokens).toEqual({
                accessToken: 'at',
                refreshToken: 'rt',
                expiresIn: 3600,
            });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const { url, init } = lastRequest();
            expect(url).toBe('https://id.twitch.tv/oauth2/token');
            expect(init.method).toBe('POST');
            expect(init.headers).toMatchObject({
                'Content-Type': 'application/x-www-form-urlencoded',
            });
            expect(init.signal).toBeDefined();
            const form = lastForm();
            expect(form.get('client_id')).toBe(TEST_TWITCH_CLIENT_ID);
            expect(form.get('client_secret')).toBe(TEST_CLIENT_SECRET);
            expect(form.get('code')).toBe(AUTH_CODE);
            expect(form.get('grant_type')).toBe('authorization_code');
            expect(form.get('redirect_uri')).toBe(TEST_REDIRECT_URI);
        });

        it('rejects with the status only, never the code or the client secret', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(400, { message: 'Invalid authorization code' }),
            );

            const error: unknown = await client
                .exchangeCode(AUTH_CODE)
                .catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(TwitchOAuthError);
            const message = (error as Error).message;
            expect(message).toContain('400');
            expect(message).not.toContain(AUTH_CODE);
            expect(message).not.toContain(TEST_CLIENT_SECRET);
        });

        it('wraps a network or timeout failure in a TwitchOAuthError', async () => {
            fetchSpy.mockRejectedValue(
                new DOMException('The operation timed out', 'TimeoutError'),
            );

            await expect(client.exchangeCode(AUTH_CODE)).rejects.toThrow(
                new TwitchOAuthError('Twitch token exchange request failed'),
            );
        });

        it('rejects when the body is not JSON', async () => {
            fetchSpy.mockResolvedValue(new Response('<html>', { status: 200 }));

            await expect(client.exchangeCode(AUTH_CODE)).rejects.toBeInstanceOf(
                TwitchOAuthError,
            );
        });

        it('rejects when the response has no access_token', async () => {
            fetchSpy.mockResolvedValue(jsonResponse(200, { expires_in: 3600 }));

            await expect(client.exchangeCode(AUTH_CODE)).rejects.toBeInstanceOf(
                TwitchOAuthError,
            );
        });
    });

    describe('validate', () => {
        it('sends an OAuth authorization header and maps a null scopes to []', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, {
                    client_id: TEST_TWITCH_CLIENT_ID,
                    login: 'tester',
                    scopes: null,
                    user_id: '123',
                    expires_in: 5000,
                }),
            );

            const info = await client.validate('at');

            expect(info).toEqual({
                clientId: TEST_TWITCH_CLIENT_ID,
                userId: '123',
                login: 'tester',
                scopes: [],
            });
            const { url, init } = lastRequest();
            expect(url).toBe('https://id.twitch.tv/oauth2/validate');
            expect(init.method ?? 'GET').toBe('GET');
            expect(init.headers).toMatchObject({ Authorization: 'OAuth at' });
            expect(init.signal).toBeDefined();
        });

        it('rejects on 401', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(401, { status: 401, message: 'invalid' }),
            );

            await expect(client.validate('at')).rejects.toBeInstanceOf(
                TwitchOAuthError,
            );
        });

        it('rejects when user_id is missing', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, {
                    client_id: TEST_TWITCH_CLIENT_ID,
                    login: 'tester',
                    scopes: [],
                }),
            );

            await expect(client.validate('at')).rejects.toBeInstanceOf(
                TwitchOAuthError,
            );
        });
    });

    describe('failure modes and defensive mapping', () => {
        const timeout = () =>
            new DOMException('signal timed out the-code', 'TimeoutError');

        it('fails the OAuth exchange on a non-JSON Twitch answer', async () => {
            fetchSpy.mockResolvedValue(
                new Response(`<html>${AUTH_CODE}</html>`, { status: 200 }),
            );

            await expect(client.exchangeCode(AUTH_CODE)).rejects.toThrow(
                new TwitchOAuthError('Twitch token response is not valid JSON'),
            );
        });

        it('fails the token validation on a non-JSON Twitch answer', async () => {
            fetchSpy.mockResolvedValue(new Response('<html>', { status: 200 }));

            await expect(client.validate('at')).rejects.toThrow(
                new TwitchOAuthError(
                    'Twitch validate response is not valid JSON',
                ),
            );
        });

        it('fails the OAuth exchange on a Twitch timeout, bounded by an abort signal', async () => {
            fetchSpy.mockRejectedValue(timeout());

            await expect(client.exchangeCode(AUTH_CODE)).rejects.toThrow(
                new TwitchOAuthError('Twitch token exchange request failed'),
            );
            expect(lastRequest().init.signal).toBeInstanceOf(AbortSignal);
        });

        it('fails the token validation on a Twitch timeout', async () => {
            fetchSpy.mockRejectedValue(timeout());

            await expect(client.validate('at')).rejects.toThrow(
                new TwitchOAuthError('Twitch validate request failed'),
            );
        });

        it('maps a token answer without refresh_token or a numeric expires_in', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, { access_token: 'at', expires_in: '3600' }),
            );

            await expect(client.exchangeCode(AUTH_CODE)).resolves.toEqual({
                accessToken: 'at',
                refreshToken: undefined,
                expiresIn: 0,
            });
        });

        it('keeps only string scopes and blanks a missing login', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, {
                    client_id: TEST_TWITCH_CLIENT_ID,
                    user_id: '123',
                    scopes: ['user:read:email', 7, null],
                }),
            );

            await expect(client.validate('at')).resolves.toEqual({
                clientId: TEST_TWITCH_CLIENT_ID,
                userId: '123',
                login: '',
                scopes: ['user:read:email'],
            });
        });
    });

    describe('revoke', () => {
        it('posts a form with client_id and token', async () => {
            fetchSpy.mockResolvedValue(emptyResponse(200));

            await expect(client.revoke('at')).resolves.toBeUndefined();

            const { url, init } = lastRequest();
            expect(url).toBe('https://id.twitch.tv/oauth2/revoke');
            expect(init.method).toBe('POST');
            expect(init.headers).toMatchObject({
                'Content-Type': 'application/x-www-form-urlencoded',
            });
            expect(init.signal).toBeDefined();
            const form = lastForm();
            expect(form.get('client_id')).toBe(TEST_TWITCH_CLIENT_ID);
            expect(form.get('token')).toBe('at');
        });

        it('rejects on 400', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(400, { message: 'Invalid token' }),
            );

            await expect(client.revoke('at')).rejects.toBeInstanceOf(
                TwitchOAuthError,
            );
        });
    });

    describe('followsChannel', () => {
        const QUERY = {
            accessToken: 'at',
            userId: '111',
            broadcasterId: '999',
        };

        it('asks Helix for that one followed channel with the user token', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, {
                    total: 1,
                    data: [{ broadcaster_id: '999' }],
                }),
            );

            await expect(client.followsChannel(QUERY)).resolves.toBe(true);

            const { url, init } = lastRequest();
            expect(url).toBe(
                'https://api.twitch.tv/helix/channels/followed?user_id=111&broadcaster_id=999',
            );
            expect(init.method).toBe('GET');
            expect(init.headers).toEqual({
                Authorization: 'Bearer at',
                'Client-Id': TEST_TWITCH_CLIENT_ID,
            });
            expect(init.signal).toBeInstanceOf(AbortSignal);
        });

        it('answers false when the user does not follow the channel', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, { total: 0, data: [] }),
            );

            await expect(client.followsChannel(QUERY)).resolves.toBe(false);
        });

        it('answers false when Twitch returns another channel', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, { data: [{ broadcaster_id: '555' }] }),
            );

            await expect(client.followsChannel(QUERY)).resolves.toBe(false);
        });

        it('rejects with the status only when the token lacks the follow scope', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(401, { message: 'Missing scope at' }),
            );

            await expect(client.followsChannel(QUERY)).rejects.toThrow(
                new TwitchOAuthError(
                    'Twitch follow check failed with status 401',
                ),
            );
        });

        it('rejects an answer without the data list', async () => {
            fetchSpy.mockResolvedValue(jsonResponse(200, { total: 1 }));

            await expect(client.followsChannel(QUERY)).rejects.toThrow(
                new TwitchOAuthError(
                    'Twitch follow check response is missing data',
                ),
            );
        });
    });

    describe('refresh', () => {
        it('posts a refresh_token grant and returns the rotated tokens', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, {
                    access_token: 'new-at',
                    refresh_token: 'new-rt',
                    expires_in: 14400,
                    scope: ['moderator:read:followers'],
                    token_type: 'bearer',
                }),
            );

            await expect(client.refresh('old-rt')).resolves.toEqual({
                accessToken: 'new-at',
                refreshToken: 'new-rt',
                expiresIn: 14400,
            });

            const { url, init } = lastRequest();
            expect(url).toBe('https://id.twitch.tv/oauth2/token');
            expect(init.method).toBe('POST');
            expect(init.signal).toBeInstanceOf(AbortSignal);
            const form = lastForm();
            expect(form.get('grant_type')).toBe('refresh_token');
            expect(form.get('refresh_token')).toBe('old-rt');
            expect(form.get('client_id')).toBe(TEST_TWITCH_CLIENT_ID);
            expect(form.get('client_secret')).toBe(TEST_CLIENT_SECRET);
        });

        it.each([400, 401])(
            'tells a refresh token rejected by Twitch (%p) apart, without leaking it',
            async (status) => {
                fetchSpy.mockResolvedValue(
                    jsonResponse(status, { message: 'Invalid refresh token' }),
                );

                const error: unknown = await client
                    .refresh('old-rt')
                    .catch((caught: unknown) => caught);

                expect(error).toBeInstanceOf(TwitchRefreshRejectedError);
                expect((error as Error).message).toBe(
                    `Twitch token refresh failed with status ${status}`,
                );
            },
        );

        it('keeps a Twitch outage apart from a rejected refresh token', async () => {
            fetchSpy.mockResolvedValue(jsonResponse(503, {}));

            const error: unknown = await client
                .refresh('old-rt')
                .catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(TwitchOAuthError);
            expect(error).not.toBeInstanceOf(TwitchRefreshRejectedError);
        });
    });

    describe('channelHasFollower', () => {
        const QUERY = {
            accessToken: 'streamer-at',
            userId: '111',
            broadcasterId: '999',
        };

        it('asks Helix whether that user follows the channel, with the streamer token', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, { total: 42, data: [{ user_id: '111' }] }),
            );

            await expect(client.channelHasFollower(QUERY)).resolves.toBe(true);

            const { url, init } = lastRequest();
            expect(url).toBe(
                'https://api.twitch.tv/helix/channels/followers?broadcaster_id=999&user_id=111',
            );
            expect(init.method).toBe('GET');
            expect(init.headers).toEqual({
                Authorization: 'Bearer streamer-at',
                'Client-Id': TEST_TWITCH_CLIENT_ID,
            });
            expect(init.signal).toBeInstanceOf(AbortSignal);
        });

        it('answers false when the follower list comes back empty', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(200, { total: 42, data: [] }),
            );

            await expect(client.channelHasFollower(QUERY)).resolves.toBe(false);
        });

        it('rejects with the status only on a refused token', async () => {
            fetchSpy.mockResolvedValue(
                jsonResponse(401, {
                    message: 'Invalid OAuth token streamer-at',
                }),
            );

            await expect(client.channelHasFollower(QUERY)).rejects.toThrow(
                new TwitchOAuthError(
                    'Twitch follower check failed with status 401',
                ),
            );
        });

        it('rejects an answer without the data list', async () => {
            fetchSpy.mockResolvedValue(jsonResponse(200, { total: 42 }));

            await expect(client.channelHasFollower(QUERY)).rejects.toThrow(
                new TwitchOAuthError(
                    'Twitch follower check response is missing data',
                ),
            );
        });
    });

    describe('when Twitch is not configured', () => {
        beforeEach(() => {
            client = new HttpTwitchOAuthClient(
                buildTestAuthConfig({ twitch: null }),
            );
        });

        it.each([
            ['exchangeCode', () => client.exchangeCode(AUTH_CODE)],
            ['validate', () => client.validate('at')],
            ['revoke', () => client.revoke('at')],
            ['refresh', () => client.refresh('rt')],
            [
                'channelHasFollower',
                () =>
                    client.channelHasFollower({
                        accessToken: 'at',
                        userId: '111',
                        broadcasterId: '999',
                    }),
            ],
            [
                'followsChannel',
                () =>
                    client.followsChannel({
                        accessToken: 'at',
                        userId: '111',
                        broadcasterId: '999',
                    }),
            ],
        ])('%s rejects without calling fetch', async (_name, call) => {
            await expect(call()).rejects.toThrow(
                new TwitchOAuthError('Twitch OAuth is not configured'),
            );
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});
