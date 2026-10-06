import { HttpTwitchOAuthClient } from 'src/auth/twitch/http-twitch-oauth.client';
import { TwitchOAuthError } from 'src/auth/twitch/twitch-oauth.client';
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
        ])('%s rejects without calling fetch', async (_name, call) => {
            await expect(call()).rejects.toThrow(
                new TwitchOAuthError('Twitch OAuth is not configured'),
            );
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});
