import {
    parseEventSubConfig,
    readEventSubEnv,
} from 'src/config/eventsub-config';
import type { EventSubEnv } from 'src/config/eventsub-config';

const SECRET = 'eventsub-test-secret-0123456789';
const CALLBACK = 'https://api.klimmeck.test/webhooks/twitch/eventsub';
const LOCAL_CALLBACK = 'http://localhost:3000/webhooks/twitch/eventsub';
const CLIENT_SECRET = 'client-secret-value';
const CLIENT = {
    TWITCH_CLIENT_ID: 'client-id',
    TWITCH_CLIENT_SECRET: CLIENT_SECRET,
};
const FULL: EventSubEnv = {
    ...CLIENT,
    TWITCH_EVENTSUB_SECRET: SECRET,
    TWITCH_EVENTSUB_CALLBACK_URL: CALLBACK,
    TWITCH_BROADCASTER_ID: '11111',
};
const EVENTSUB_KEYS = [
    'TWITCH_EVENTSUB_SECRET',
    'TWITCH_EVENTSUB_CALLBACK_URL',
    'TWITCH_BROADCASTER_ID',
] as const;
const NODE_ENVS = ['development', 'production'];

const PRODUCTION_REQUIRED_MESSAGE =
    'TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID are required when NODE_ENV=production';
const SECRET_MESSAGE =
    'TWITCH_EVENTSUB_SECRET must be 10-100 printable ASCII characters without spaces';
const CALLBACK_MESSAGE =
    'TWITCH_EVENTSUB_CALLBACK_URL must be an absolute https URL on port 443 without credentials or fragment (http://localhost or http://127.0.0.1 only outside production)';
const BROADCASTER_MESSAGE =
    'TWITCH_BROADCASTER_ID must be the numeric Twitch user id of the channel';
const CLIENT_MESSAGE =
    'TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required when TWITCH_EVENTSUB_CALLBACK_URL is https (EventSub subscriptions are managed with an app access token)';

const REJECTED_CALLBACKS = [
    'https://api.klimmeck.test:8443/x',
    'http://api.klimmeck.test/x',
    'https://user:pw@api.klimmeck.test/x',
    'https://api.klimmeck.test/x#frag',
    ' https://api.klimmeck.test/x',
    'not a url',
    'ftp://api.klimmeck.test/x',
];

function without(env: EventSubEnv, key: keyof EventSubEnv): EventSubEnv {
    const copy = { ...env };
    delete copy[key];
    return copy;
}

function messageOf(action: () => unknown): string {
    try {
        action();
    } catch (error) {
        return (error as Error).message;
    }
    throw new Error('expected the action to throw');
}

function managedConfig(callbackUrl = CALLBACK) {
    return {
        mode: 'managed',
        secret: SECRET,
        callbackUrl,
        broadcasterId: '11111',
        clientId: 'client-id',
        clientSecret: CLIENT_SECRET,
        reconcileIntervalMs: 3_600_000,
    };
}

describe('parseEventSubConfig', () => {
    describe('without the EventSub variables', () => {
        it.each([undefined, 'development', 'test'])(
            'disables EventSub outside production (NODE_ENV %p)',
            (nodeEnv) => {
                expect(parseEventSubConfig({ NODE_ENV: nodeEnv })).toEqual({
                    mode: 'disabled',
                });
                expect(
                    parseEventSubConfig({
                        NODE_ENV: nodeEnv,
                        TWITCH_EVENTSUB_SECRET: '',
                        TWITCH_EVENTSUB_CALLBACK_URL: '',
                        TWITCH_BROADCASTER_ID: '',
                    }),
                ).toEqual({ mode: 'disabled' });
                expect(
                    parseEventSubConfig({ NODE_ENV: nodeEnv, ...CLIENT }),
                ).toEqual({ mode: 'disabled' });
            },
        );

        it('rejects production without the EventSub variables', () => {
            expect(() =>
                parseEventSubConfig({ NODE_ENV: 'production' }),
            ).toThrow(PRODUCTION_REQUIRED_MESSAGE);
            expect(() =>
                parseEventSubConfig({ NODE_ENV: 'production', ...CLIENT }),
            ).toThrow(PRODUCTION_REQUIRED_MESSAGE);
        });
    });

    describe('with the full configuration', () => {
        it.each(NODE_ENVS)('is managed (NODE_ENV %p)', (nodeEnv) => {
            expect(parseEventSubConfig({ ...FULL, NODE_ENV: nodeEnv })).toEqual(
                managedConfig(),
            );
        });
    });

    describe('with a partial configuration', () => {
        it.each(EVENTSUB_KEYS)(
            'rejects the boot when %s is missing',
            (missingKey) => {
                for (const nodeEnv of NODE_ENVS) {
                    const message = messageOf(() =>
                        parseEventSubConfig({
                            ...without(FULL, missingKey),
                            NODE_ENV: nodeEnv,
                        }),
                    );

                    expect(message).toContain(
                        'EventSub configuration is incomplete',
                    );
                    expect(message).toContain(missingKey);
                }
            },
        );

        it('rejects the secret and broadcaster without the callback (local .env)', () => {
            const message = messageOf(() =>
                parseEventSubConfig({
                    TWITCH_EVENTSUB_SECRET: SECRET,
                    TWITCH_BROADCASTER_ID: '11111',
                }),
            );

            expect(message).toContain('EventSub configuration is incomplete');
            expect(message).toContain('TWITCH_EVENTSUB_CALLBACK_URL');
        });
    });

    describe('TWITCH_EVENTSUB_SECRET', () => {
        it.each(['a'.repeat(10), 'b'.repeat(100)])(
            'accepts a secret of length %#',
            (secret) => {
                expect(
                    parseEventSubConfig({
                        ...FULL,
                        TWITCH_EVENTSUB_SECRET: secret,
                    }),
                ).toEqual({ ...managedConfig(), secret });
            },
        );

        it.each([
            'short1234',
            'c'.repeat(101),
            'secret with space',
            'segretè0123456',
        ])('rejects %p', (secret) => {
            expect(() =>
                parseEventSubConfig({
                    ...FULL,
                    TWITCH_EVENTSUB_SECRET: secret,
                }),
            ).toThrow(SECRET_MESSAGE);
        });
    });

    describe('TWITCH_EVENTSUB_CALLBACK_URL', () => {
        it.each([
            'https://api.klimmeck.test:443/webhooks/twitch/eventsub',
            'https://API.Klimmeck.test/webhooks/twitch/eventsub',
        ])('normalizes %p', (callback) => {
            expect(
                parseEventSubConfig({
                    ...FULL,
                    TWITCH_EVENTSUB_CALLBACK_URL: callback,
                }),
            ).toEqual(managedConfig(CALLBACK));
        });

        it('is local with an http localhost callback outside production, without app credentials', () => {
            expect(
                parseEventSubConfig({
                    NODE_ENV: 'development',
                    TWITCH_EVENTSUB_SECRET: SECRET,
                    TWITCH_EVENTSUB_CALLBACK_URL: LOCAL_CALLBACK,
                    TWITCH_BROADCASTER_ID: '11111',
                }),
            ).toEqual({
                mode: 'local',
                secret: SECRET,
                callbackUrl: LOCAL_CALLBACK,
                broadcasterId: '11111',
            });
        });

        it('is local with an http 127.0.0.1 callback outside production', () => {
            const callback = 'http://127.0.0.1:3000/webhooks/twitch/eventsub';

            expect(
                parseEventSubConfig({
                    ...FULL,
                    NODE_ENV: 'development',
                    TWITCH_EVENTSUB_CALLBACK_URL: callback,
                }),
            ).toEqual({
                mode: 'local',
                secret: SECRET,
                callbackUrl: callback,
                broadcasterId: '11111',
            });
        });

        it('rejects the local callback in production', () => {
            expect(() =>
                parseEventSubConfig({
                    ...FULL,
                    NODE_ENV: 'production',
                    TWITCH_EVENTSUB_CALLBACK_URL: LOCAL_CALLBACK,
                }),
            ).toThrow(CALLBACK_MESSAGE);
        });

        it.each(REJECTED_CALLBACKS)('rejects %p', (callback) => {
            expect(() =>
                parseEventSubConfig({
                    ...FULL,
                    TWITCH_EVENTSUB_CALLBACK_URL: callback,
                }),
            ).toThrow(CALLBACK_MESSAGE);
        });
    });

    describe('TWITCH_BROADCASTER_ID', () => {
        it.each(['lordreavor', '-1', '1e5', '123456789012345678901'])(
            'rejects %p',
            (broadcasterId) => {
                expect(() =>
                    parseEventSubConfig({
                        ...FULL,
                        TWITCH_BROADCASTER_ID: broadcasterId,
                    }),
                ).toThrow(BROADCASTER_MESSAGE);
            },
        );
    });

    describe('managed mode without app credentials', () => {
        it.each(['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'] as const)(
            'rejects the boot without %s',
            (missingKey) => {
                for (const nodeEnv of NODE_ENVS) {
                    expect(() =>
                        parseEventSubConfig({
                            ...without(FULL, missingKey),
                            NODE_ENV: nodeEnv,
                        }),
                    ).toThrow(CLIENT_MESSAGE);
                }
            },
        );
    });

    describe('error messages', () => {
        const cases: Array<{ name: string; env: EventSubEnv; value?: string }> =
            [
                {
                    name: 'production',
                    env: { NODE_ENV: 'production', ...CLIENT },
                },
                {
                    name: 'partial',
                    env: without(FULL, 'TWITCH_BROADCASTER_ID'),
                },
                {
                    name: 'short secret',
                    env: { ...FULL, TWITCH_EVENTSUB_SECRET: 'short1234' },
                    value: 'short1234',
                },
                {
                    name: 'broadcaster',
                    env: { ...FULL, TWITCH_BROADCASTER_ID: 'lordreavor' },
                    value: 'lordreavor',
                },
                {
                    name: 'client',
                    env: without(FULL, 'TWITCH_CLIENT_ID'),
                },
                {
                    name: 'local callback in production',
                    env: {
                        ...FULL,
                        NODE_ENV: 'production',
                        TWITCH_EVENTSUB_CALLBACK_URL: LOCAL_CALLBACK,
                    },
                    value: LOCAL_CALLBACK,
                },
                ...REJECTED_CALLBACKS.map((callback) => ({
                    name: `callback ${callback}`,
                    env: { ...FULL, TWITCH_EVENTSUB_CALLBACK_URL: callback },
                    value: callback,
                })),
            ];

        it.each(cases)('never echo a value ($name)', ({ env, value }) => {
            const message = messageOf(() => parseEventSubConfig(env));

            expect(message).not.toContain(SECRET);
            expect(message).not.toContain(CLIENT_SECRET);
            if (value) expect(message).not.toContain(value);
        });
    });
});

describe('readEventSubEnv', () => {
    it('keeps only the eventsub keys', () => {
        expect(
            readEventSubEnv({
                NODE_ENV: 'production',
                TWITCH_EVENTSUB_SECRET: 'x',
                JWT_SECRET: 'y',
                TWITCH_REDIRECT_URI: 'z',
            }),
        ).toEqual({ NODE_ENV: 'production', TWITCH_EVENTSUB_SECRET: 'x' });
    });
});
