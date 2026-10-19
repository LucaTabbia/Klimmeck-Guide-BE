import type { EventSubConfig } from 'src/config/eventsub-config';
import {
    HELIX_EVENTSUB_SUBSCRIPTIONS_URL,
    HttpTwitchHelixClient,
} from 'src/eventsub/helix/http-twitch-helix.client';
import { TwitchAppTokenCache } from 'src/eventsub/helix/twitch-app-token.cache';
import { TwitchHelixError } from 'src/eventsub/helix/twitch-helix.client';
import type { CreateEventSubSubscriptionRequest } from 'src/eventsub/helix/twitch-helix.client';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    TEST_BROADCASTER_ID,
    TEST_EVENTSUB_SECRET,
} from '../../../test/eventsub/eventsub-fixtures';
import {
    buildLocalEventSubConfig,
    buildTestEventSubConfig,
    TEST_CALLBACK_URL,
} from '../../../test/eventsub/test-eventsub-config';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const SECRET_FRAGMENTS = [
    'app-token',
    'test-client-secret',
    TEST_EVENTSUB_SECRET,
];

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function emptyResponse(status: number): Response {
    return new Response(null, { status });
}

function rawSubscription(overrides: Record<string, unknown> = {}) {
    return {
        id: 'sub-1',
        status: 'enabled',
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: TEST_BROADCASTER_ID },
        transport: { method: 'webhook', callback: TEST_CALLBACK_URL },
        created_at: '2026-10-19T12:00:00.000Z',
        cost: 0,
        ...overrides,
    };
}

function listPage(data: unknown[], cursor?: string): Response {
    return jsonResponse(200, {
        data,
        total: data.length,
        pagination: cursor === undefined ? {} : { cursor },
    });
}

const CREATE_REQUEST: CreateEventSubSubscriptionRequest = {
    type: 'stream.online',
    version: '1',
    condition: { broadcaster_user_id: TEST_BROADCASTER_ID },
    transport: {
        method: 'webhook',
        callback: TEST_CALLBACK_URL,
        secret: TEST_EVENTSUB_SECRET,
    },
};

describe('HttpTwitchHelixClient', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let helixResponses: Response[];
    let tokenRequests: number;

    beforeEach(() => {
        helixResponses = [];
        tokenRequests = 0;
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockImplementation((input: string | URL | Request) => {
                const url = String(input);
                if (url === TOKEN_URL) {
                    tokenRequests += 1;
                    return Promise.resolve(
                        jsonResponse(200, {
                            access_token: 'app-token',
                            expires_in: 3600,
                            token_type: 'bearer',
                        }),
                    );
                }
                const next = url.startsWith(HELIX_EVENTSUB_SUBSCRIPTIONS_URL)
                    ? helixResponses.shift()
                    : undefined;
                if (!next) {
                    return Promise.reject(new Error('Unexpected network call'));
                }
                return Promise.resolve(next);
            });
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    function buildClient(
        config: EventSubConfig = buildTestEventSubConfig(),
    ): HttpTwitchHelixClient {
        const clock = new FixedClock(new Date('2026-10-19T12:00:00.000Z'));
        return new HttpTwitchHelixClient(
            config,
            new TwitchAppTokenCache(config, clock),
        );
    }

    function helixCalls(): Array<{ url: string; init: RequestInit }> {
        return fetchSpy.mock.calls
            .map(([url, init]) => ({ url: String(url), init: init ?? {} }))
            .filter(({ url }) => url !== TOKEN_URL);
    }

    async function rejectionOf(
        promise: Promise<unknown>,
    ): Promise<TwitchHelixError> {
        const error = await promise.then(
            () => {
                throw new Error('expected a rejection');
            },
            (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(TwitchHelixError);
        const helixError = error as TwitchHelixError;
        for (const fragment of SECRET_FRAGMENTS) {
            expect(helixError.message).not.toContain(fragment);
        }
        return helixError;
    }

    describe('listEventSubSubscriptions', () => {
        it('lists with the app token and the client id, mapping each subscription', async () => {
            helixResponses.push(listPage([rawSubscription()]));

            const subscriptions =
                await buildClient().listEventSubSubscriptions();

            expect(subscriptions).toEqual([
                {
                    id: 'sub-1',
                    status: 'enabled',
                    type: 'channel.channel_points_custom_reward_redemption.add',
                    version: '1',
                    condition: { broadcaster_user_id: TEST_BROADCASTER_ID },
                    transport: {
                        method: 'webhook',
                        callback: TEST_CALLBACK_URL,
                    },
                    createdAt: '2026-10-19T12:00:00.000Z',
                },
            ]);
            const [call] = helixCalls();
            expect(call.url).toBe(HELIX_EVENTSUB_SUBSCRIPTIONS_URL);
            expect(call.init.method).toBe('GET');
            expect(call.init.headers).toMatchObject({
                Authorization: 'Bearer app-token',
                'Client-Id': 'test-client-id',
            });
            expect(call.init.signal).toBeDefined();
        });

        it('follows the pagination cursor', async () => {
            helixResponses.push(
                listPage([rawSubscription({ id: 'sub-1' })], 'c1'),
                listPage([rawSubscription({ id: 'sub-2' })]),
            );

            const subscriptions =
                await buildClient().listEventSubSubscriptions();

            expect(subscriptions.map(({ id }) => id)).toEqual([
                'sub-1',
                'sub-2',
            ]);
            const calls = helixCalls();
            expect(calls).toHaveLength(2);
            expect(new URL(calls[0].url).searchParams.has('after')).toBe(false);
            expect(new URL(calls[1].url).searchParams.get('after')).toBe('c1');
            expect(tokenRequests).toBe(1);
        });

        it('maps defensively: string conditions, invalid JSON, missing id and callback', async () => {
            helixResponses.push(
                listPage([
                    rawSubscription({
                        id: 'sub-string',
                        condition: '{"broadcaster_user_id":"11111"}',
                    }),
                    rawSubscription({
                        id: 'sub-broken',
                        condition: 'not json',
                    }),
                    rawSubscription({ id: undefined }),
                    rawSubscription({
                        id: 'sub-no-callback',
                        transport: { method: 'webhook' },
                    }),
                ]),
            );

            const subscriptions =
                await buildClient().listEventSubSubscriptions();

            expect(subscriptions.map(({ id }) => id)).toEqual([
                'sub-string',
                'sub-broken',
                'sub-no-callback',
            ]);
            expect(subscriptions[0].condition).toEqual({
                broadcaster_user_id: '11111',
            });
            expect(subscriptions[1].condition).toEqual({});
            expect(subscriptions[2].transport).toEqual({
                method: 'webhook',
                callback: null,
            });
        });

        it('stops after twenty pages', async () => {
            for (let page = 1; page <= 21; page += 1) {
                helixResponses.push(
                    listPage(
                        [rawSubscription({ id: `sub-${page}` })],
                        `c${page}`,
                    ),
                );
            }

            const error = await rejectionOf(
                buildClient().listEventSubSubscriptions(),
            );

            expect(error.message).toBe(
                'Helix list subscriptions exceeded 20 pages',
            );
            expect(helixCalls()).toHaveLength(20);
        });

        it('reports a network failure without details', async () => {
            const error = await rejectionOf(
                buildClient().listEventSubSubscriptions(),
            );

            expect(error.message).toBe(
                'Helix list subscriptions request failed',
            );
            expect(error.status).toBeUndefined();
        });

        it('rejects in a non managed environment without any request', async () => {
            await expect(
                buildClient(
                    buildLocalEventSubConfig(),
                ).listEventSubSubscriptions(),
            ).rejects.toThrow(
                new TwitchHelixError(
                    'EventSub subscriptions are not managed in this environment',
                ),
            );
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    describe('createEventSubSubscription', () => {
        it('posts the request as JSON and maps the created subscription', async () => {
            helixResponses.push(
                jsonResponse(202, {
                    data: [
                        rawSubscription({
                            id: 'sub-new',
                            type: 'stream.online',
                            status: 'webhook_callback_verification_pending',
                        }),
                    ],
                    total: 1,
                }),
            );

            const subscription =
                await buildClient().createEventSubSubscription(CREATE_REQUEST);

            expect(subscription).toMatchObject({
                id: 'sub-new',
                type: 'stream.online',
                status: 'webhook_callback_verification_pending',
            });
            const [call] = helixCalls();
            expect(call.url).toBe(HELIX_EVENTSUB_SUBSCRIPTIONS_URL);
            expect(call.init.method).toBe('POST');
            expect(call.init.headers).toMatchObject({
                Authorization: 'Bearer app-token',
                'Client-Id': 'test-client-id',
                'Content-Type': 'application/json',
            });
            expect(JSON.parse(call.init.body as string)).toEqual({
                type: 'stream.online',
                version: '1',
                condition: { broadcaster_user_id: TEST_BROADCASTER_ID },
                transport: {
                    method: 'webhook',
                    callback: TEST_CALLBACK_URL,
                    secret: TEST_EVENTSUB_SECRET,
                },
            });
        });

        it.each([403, 409])(
            'rejects a %i with its status and no Twitch body',
            async (status) => {
                helixResponses.push(
                    jsonResponse(status, {
                        error: 'Forbidden',
                        message: `secret ${TEST_EVENTSUB_SECRET} app-token`,
                    }),
                );

                const error = await rejectionOf(
                    buildClient().createEventSubSubscription(CREATE_REQUEST),
                );

                expect(error.status).toBe(status);
                expect(error.message).toBe(
                    `Helix create subscription failed with status ${status}`,
                );
            },
        );

        it('rejects a 202 without a subscription in data', async () => {
            helixResponses.push(jsonResponse(202, { data: [] }));

            const error = await rejectionOf(
                buildClient().createEventSubSubscription(CREATE_REQUEST),
            );

            expect(error.message).toBe(
                'Helix create subscription response is missing the subscription',
            );
        });
    });

    describe('deleteEventSubSubscription', () => {
        it('deletes by id', async () => {
            helixResponses.push(emptyResponse(204));

            await expect(
                buildClient().deleteEventSubSubscription('sub-1'),
            ).resolves.toBeUndefined();

            const [call] = helixCalls();
            expect(call.init.method).toBe('DELETE');
            const url = new URL(call.url);
            expect(`${url.origin}${url.pathname}`).toBe(
                HELIX_EVENTSUB_SUBSCRIPTIONS_URL,
            );
            expect(url.searchParams.get('id')).toBe('sub-1');
            expect(call.init.headers).toMatchObject({
                Authorization: 'Bearer app-token',
                'Client-Id': 'test-client-id',
            });
        });

        it('treats a 404 as already deleted', async () => {
            helixResponses.push(emptyResponse(404));

            await expect(
                buildClient().deleteEventSubSubscription('sub-gone'),
            ).resolves.toBeUndefined();
        });

        it('rejects a 500 with its status', async () => {
            helixResponses.push(emptyResponse(500));

            const error = await rejectionOf(
                buildClient().deleteEventSubSubscription('sub-1'),
            );

            expect(error.status).toBe(500);
            expect(error.message).toBe(
                'Helix delete subscription failed with status 500',
            );
        });
    });

    describe('expired app token', () => {
        it('invalidates the token on a 401 and retries once with a new one', async () => {
            helixResponses.push(
                emptyResponse(401),
                listPage([rawSubscription()]),
            );

            const subscriptions =
                await buildClient().listEventSubSubscriptions();

            expect(subscriptions).toHaveLength(1);
            expect(tokenRequests).toBe(2);
            const calls = helixCalls();
            expect(calls).toHaveLength(2);
            expect(calls[1].init.signal).toBeDefined();
            expect(calls[1].init.signal).not.toBe(calls[0].init.signal);
        });

        it('gives up after a second 401', async () => {
            helixResponses.push(
                emptyResponse(401),
                emptyResponse(401),
                emptyResponse(204),
            );

            const error = await rejectionOf(
                buildClient().deleteEventSubSubscription('sub-1'),
            );

            expect(error.status).toBe(401);
            expect(error.message).toBe(
                'Helix delete subscription failed with status 401',
            );
            expect(helixCalls()).toHaveLength(2);
        });
    });
});
