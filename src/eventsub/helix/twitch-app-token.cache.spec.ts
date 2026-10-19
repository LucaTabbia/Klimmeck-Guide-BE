import type { EventSubConfig } from 'src/config/eventsub-config';
import { TwitchAppTokenCache } from 'src/eventsub/helix/twitch-app-token.cache';
import { TwitchHelixError } from 'src/eventsub/helix/twitch-helix.client';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildLocalEventSubConfig,
    buildTestEventSubConfig,
} from '../../../test/eventsub/test-eventsub-config';

const START = new Date('2026-10-19T12:00:00.000Z');
const EXPIRES_IN_SECONDS = 5011271;
const REFRESH_MARGIN_SECONDS = 300;

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function tokenResponse(accessToken: string): Response {
    return jsonResponse(200, {
        access_token: accessToken,
        expires_in: EXPIRES_IN_SECONDS,
        token_type: 'bearer',
    });
}

describe('TwitchAppTokenCache', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let clock: FixedClock;

    beforeEach(() => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockRejectedValue(new Error('Unexpected network call'));
        clock = new FixedClock(START);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    function buildCache(
        config: EventSubConfig = buildTestEventSubConfig(),
    ): TwitchAppTokenCache {
        return new TwitchAppTokenCache(config, clock);
    }

    async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
        return promise.then(
            () => {
                throw new Error('expected a rejection');
            },
            (error: unknown) => error,
        );
    }

    it('requests a client credentials token with the EventSub credentials', async () => {
        fetchSpy.mockResolvedValueOnce(tokenResponse('app-token-1'));

        await expect(buildCache().getToken()).resolves.toBe('app-token-1');

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(String(url)).toBe('https://id.twitch.tv/oauth2/token');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
            'Content-Type': 'application/x-www-form-urlencoded',
        });
        expect(init?.signal).toBeDefined();
        const form = new URLSearchParams(init?.body as string);
        expect(form.get('client_id')).toBe('test-client-id');
        expect(form.get('client_secret')).toBe('test-client-secret');
        expect(form.get('grant_type')).toBe('client_credentials');
    });

    it('reuses the cached token', async () => {
        fetchSpy.mockResolvedValueOnce(tokenResponse('app-token-1'));
        const cache = buildCache();

        await cache.getToken();

        await expect(cache.getToken()).resolves.toBe('app-token-1');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('requests a new token once inside the five minute refresh margin', async () => {
        fetchSpy
            .mockResolvedValueOnce(tokenResponse('app-token-1'))
            .mockResolvedValueOnce(tokenResponse('app-token-2'));
        const cache = buildCache();
        await cache.getToken();

        clock.advanceSeconds(EXPIRES_IN_SECONDS - REFRESH_MARGIN_SECONDS);

        await expect(cache.getToken()).resolves.toBe('app-token-2');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps the token until just before the refresh margin', async () => {
        fetchSpy.mockResolvedValueOnce(tokenResponse('app-token-1'));
        const cache = buildCache();
        await cache.getToken();

        clock.advanceSeconds(EXPIRES_IN_SECONDS - REFRESH_MARGIN_SECONDS - 1);

        await expect(cache.getToken()).resolves.toBe('app-token-1');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('shares a single request between concurrent callers', async () => {
        fetchSpy.mockResolvedValueOnce(tokenResponse('app-token-1'));
        const cache = buildCache();

        const tokens = await Promise.all([
            cache.getToken(),
            cache.getToken(),
            cache.getToken(),
        ]);

        expect(tokens).toEqual(['app-token-1', 'app-token-1', 'app-token-1']);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('requests a new token after invalidate', async () => {
        fetchSpy
            .mockResolvedValueOnce(tokenResponse('app-token-1'))
            .mockResolvedValueOnce(tokenResponse('app-token-2'));
        const cache = buildCache();
        await cache.getToken();

        cache.invalidate();

        await expect(cache.getToken()).resolves.toBe('app-token-2');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it.each<[string, Record<string, unknown>]>([
        ['missing', {}],
        ['zero', { expires_in: 0 }],
    ])(
        'does not reuse a token whose expires_in is %s',
        async (_label, expiry) => {
            fetchSpy
                .mockResolvedValueOnce(
                    jsonResponse(200, {
                        access_token: 'app-token-1',
                        ...expiry,
                    }),
                )
                .mockResolvedValueOnce(
                    jsonResponse(200, {
                        access_token: 'app-token-2',
                        ...expiry,
                    }),
                );
            const cache = buildCache();

            await expect(cache.getToken()).resolves.toBe('app-token-1');
            await expect(cache.getToken()).resolves.toBe('app-token-2');
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        },
    );

    it('rejects a failed token request without leaking the secret and retries next time', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                jsonResponse(400, {
                    status: 400,
                    message: 'invalid client secret test-client-secret',
                }),
            )
            .mockResolvedValueOnce(tokenResponse('app-token-1'));
        const cache = buildCache();

        const error = await rejectionOf(cache.getToken());

        expect(error).toBeInstanceOf(TwitchHelixError);
        expect((error as TwitchHelixError).status).toBe(400);
        expect((error as TwitchHelixError).message).toBe(
            'Twitch app token failed with status 400',
        );
        expect((error as TwitchHelixError).message).not.toContain(
            'test-client-secret',
        );
        await expect(cache.getToken()).resolves.toBe('app-token-1');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects a response without access_token', async () => {
        fetchSpy.mockResolvedValueOnce(
            jsonResponse(200, { expires_in: EXPIRES_IN_SECONDS }),
        );

        await expect(buildCache().getToken()).rejects.toThrow(
            new TwitchHelixError(
                'Twitch app token response is missing access_token',
            ),
        );
    });

    it.each<[string, EventSubConfig]>([
        ['local', buildLocalEventSubConfig()],
        ['disabled', { mode: 'disabled' }],
    ])('refuses to request a token in %s mode', async (_label, config) => {
        await expect(buildCache(config).getToken()).rejects.toThrow(
            new TwitchHelixError(
                'EventSub subscriptions are not managed in this environment',
            ),
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
