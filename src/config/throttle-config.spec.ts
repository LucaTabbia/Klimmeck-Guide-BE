import {
    DEFAULT_THROTTLE_LIMIT,
    DEFAULT_THROTTLE_TTL_MS,
    parseThrottleConfig,
    readThrottleEnv,
    WEBHOOK_LIMIT_FACTOR,
} from 'src/config/throttle-config';

function thrownBy(action: () => unknown): Error {
    try {
        action();
    } catch (error) {
        return error as Error;
    }
    throw new Error('expected the parser to throw');
}

describe('parseThrottleConfig', () => {
    it('defaults to 20 requests per minute and a webhook bucket 50 times larger (D-08, A6)', () => {
        expect(DEFAULT_THROTTLE_TTL_MS).toBe(60_000);
        expect(DEFAULT_THROTTLE_LIMIT).toBe(20);
        expect(WEBHOOK_LIMIT_FACTOR).toBe(50);
        expect(parseThrottleConfig({})).toEqual({
            ttlMs: 60000,
            limit: 20,
            webhookLimit: 1000,
            trustProxy: null,
        });
    });

    it('treats empty throttle variables as the defaults (D-08)', () => {
        expect(
            parseThrottleConfig({
                THROTTLE_TTL_MS: '',
                THROTTLE_LIMIT: '  ',
                THROTTLE_TRUST_PROXY: '',
            }),
        ).toEqual({
            ttlMs: 60000,
            limit: 20,
            webhookLimit: 1000,
            trustProxy: null,
        });
    });

    it('reads explicit throttle values (D-08)', () => {
        expect(
            parseThrottleConfig({
                THROTTLE_TTL_MS: '1000',
                THROTTLE_LIMIT: '3',
            }),
        ).toEqual({
            ttlMs: 1000,
            limit: 3,
            webhookLimit: 150,
            trustProxy: null,
        });
    });

    it.each(['0', '-1', '1.5', 'abc'])(
        'refuses THROTTLE_LIMIT=%s at boot without echoing it (D-08)',
        (value) => {
            const error = thrownBy(() =>
                parseThrottleConfig({ THROTTLE_LIMIT: value }),
            );

            expect(error.message).toBe(
                'THROTTLE_LIMIT must be a positive integer',
            );
        },
    );

    it.each(['0', '-1', '1.5', 'abc'])(
        'refuses THROTTLE_TTL_MS=%s at boot without echoing it (D-08)',
        (value) => {
            const error = thrownBy(() =>
                parseThrottleConfig({ THROTTLE_TTL_MS: value }),
            );

            expect(error.message).toBe(
                'THROTTLE_TTL_MS must be a positive integer',
            );
        },
    );

    it('keeps the proxy trust off unless configured (C19)', () => {
        expect(
            parseThrottleConfig({ THROTTLE_TRUST_PROXY: '' }).trustProxy,
        ).toBeNull();
        expect(
            parseThrottleConfig({ THROTTLE_TRUST_PROXY: '1' }).trustProxy,
        ).toBe('1');
        expect(
            parseThrottleConfig({
                THROTTLE_TRUST_PROXY: 'loopback, 10.0.0.0/8',
            }).trustProxy,
        ).toBe('loopback, 10.0.0.0/8');
        expect(
            thrownBy(() => parseThrottleConfig({ THROTTLE_TRUST_PROXY: 'a;b' }))
                .message,
        ).toBe(
            'THROTTLE_TRUST_PROXY must be a hop count or a list of addresses',
        );
    });
});

describe('readThrottleEnv', () => {
    it('reads only the throttle keys', () => {
        expect(
            readThrottleEnv({
                THROTTLE_TTL_MS: '1000',
                THROTTLE_LIMIT: '3',
                THROTTLE_TRUST_PROXY: '1',
                JWT_SECRET: 'test-secret',
            }),
        ).toEqual({
            THROTTLE_TTL_MS: '1000',
            THROTTLE_LIMIT: '3',
            THROTTLE_TRUST_PROXY: '1',
        });
    });
});
