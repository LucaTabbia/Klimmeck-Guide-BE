import { AuthEnv, parseAuthConfig, readAuthEnv } from 'src/config/auth-config';
import { RoleType } from 'src/models/enums/role-type.enum';

const VALID_SECRET = 's'.repeat(32);
const DEV_TOKEN = 'dev-access-token-0123';

function parseWith(overrides: AuthEnv) {
    return parseAuthConfig({ JWT_SECRET: VALID_SECRET, ...overrides });
}

function devAuthEnv(overrides: AuthEnv = {}): AuthEnv {
    return {
        DEV_AUTH_ENABLED: 'true',
        DEV_AUTH_ACCESS_TOKEN: DEV_TOKEN,
        DEV_AUTH_TWITCH_ID: 'dev-twitch-1',
        DEV_AUTH_ROLE: 'innkeeper',
        ...overrides,
    };
}

const TWITCH_ENV: AuthEnv = {
    TWITCH_CLIENT_ID: 'client-id',
    TWITCH_CLIENT_SECRET: 'client-secret',
    TWITCH_REDIRECT_URI: 'https://api.example.com/auth/twitch/callback',
};

describe('parseAuthConfig', () => {
    it('returns the defaults with only a valid JWT_SECRET', () => {
        expect(parseAuthConfig({ JWT_SECRET: VALID_SECRET })).toEqual({
            jwtSecret: VALID_SECRET,
            accessTokenTtlSeconds: 900,
            refreshTokenTtlSeconds: 2_592_000,
            refreshTokenGraceSeconds: 30,
            loginTicketTtlSeconds: 60,
            oauthStateTtlSeconds: 600,
            appAuthRedirectUrl: 'klimmeck://auth',
            twitch: null,
            devAuth: null,
        });
    });

    describe('JWT_SECRET', () => {
        it('throws when missing', () => {
            expect(() => parseAuthConfig({})).toThrow(/JWT_SECRET/);
        });

        it('throws when shorter than 32 characters without leaking it', () => {
            const shortSecret = 'leaky-secret-value-'.padEnd(31, 'x');

            expect(shortSecret).toHaveLength(31);
            expect(() => parseAuthConfig({ JWT_SECRET: shortSecret })).toThrow(
                /JWT_SECRET/,
            );
            try {
                parseAuthConfig({ JWT_SECRET: shortSecret });
            } catch (error) {
                expect((error as Error).message).not.toContain(shortSecret);
            }
        });
    });

    describe('Twitch OAuth', () => {
        it('is configured when all three variables are set', () => {
            expect(parseWith(TWITCH_ENV).twitch).toEqual({
                clientId: 'client-id',
                clientSecret: 'client-secret',
                redirectUri: 'https://api.example.com/auth/twitch/callback',
            });
        });

        it('accepts a http://localhost redirect uri', () => {
            const config = parseWith({
                ...TWITCH_ENV,
                TWITCH_REDIRECT_URI:
                    'http://localhost:3000/auth/twitch/callback',
            });

            expect(config.twitch?.redirectUri).toBe(
                'http://localhost:3000/auth/twitch/callback',
            );
        });

        it.each([
            'TWITCH_CLIENT_ID',
            'TWITCH_CLIENT_SECRET',
            'TWITCH_REDIRECT_URI',
        ] as const)('is null without throwing when %s is missing', (key) => {
            expect(parseWith({ ...TWITCH_ENV, [key]: undefined }).twitch).toBe(
                null,
            );
            expect(parseWith({ ...TWITCH_ENV, [key]: '' }).twitch).toBe(null);
        });

        it('throws when the redirect uri is neither https nor localhost', () => {
            expect(() =>
                parseWith({
                    ...TWITCH_ENV,
                    TWITCH_REDIRECT_URI: 'http://api.example.com/callback',
                }),
            ).toThrow(/TWITCH_REDIRECT_URI/);
        });
    });

    describe('dev auth bypass', () => {
        it('refuses DEV_AUTH_ENABLED=true in production', () => {
            expect(() =>
                parseWith({ ...devAuthEnv(), NODE_ENV: 'production' }),
            ).toThrow(/DEV_AUTH_ENABLED.*production/);
        });

        it('builds the dev identity when enabled with valid values', () => {
            expect(parseWith(devAuthEnv()).devAuth).toEqual({
                accessToken: DEV_TOKEN,
                twitchId: 'dev-twitch-1',
                role: RoleType.innkeeper,
            });
        });

        it.each(['1', 'TRUE ', 'yes', 'True', undefined])(
            'stays disabled when DEV_AUTH_ENABLED is %p',
            (value) => {
                expect(
                    parseWith(devAuthEnv({ DEV_AUTH_ENABLED: value })).devAuth,
                ).toBe(null);
            },
        );

        it('throws when the dev token is shorter than 16 characters', () => {
            expect(() =>
                parseWith(
                    devAuthEnv({ DEV_AUTH_ACCESS_TOKEN: 'a'.repeat(15) }),
                ),
            ).toThrow(/DEV_AUTH_ACCESS_TOKEN/);
        });

        it('throws when the dev twitch id is empty', () => {
            expect(() =>
                parseWith(devAuthEnv({ DEV_AUTH_TWITCH_ID: '' })),
            ).toThrow(/DEV_AUTH_TWITCH_ID/);
        });

        it('throws when the dev role is not a RoleType', () => {
            expect(() =>
                parseWith(devAuthEnv({ DEV_AUTH_ROLE: 'admin' })),
            ).toThrow(/DEV_AUTH_ROLE/);
        });
    });

    describe('APP_AUTH_REDIRECT_URL', () => {
        it('defaults to klimmeck://auth', () => {
            expect(parseWith({}).appAuthRedirectUrl).toBe('klimmeck://auth');
        });

        it.each(['klimmeck://auth', 'com.klimmeck.app://auth/callback'])(
            'accepts the custom scheme deep link %p',
            (value) => {
                expect(
                    parseWith({ APP_AUTH_REDIRECT_URL: value })
                        .appAuthRedirectUrl,
                ).toBe(value);
            },
        );

        it.each([
            'https://evil.example/auth',
            'HTTPS://evil.example/auth',
            'http://x',
            'klimmeck-auth',
            'klimmeck:auth',
            ' https://evil.example/x',
            '\thttps://evil.example',
            ' klimmeck://auth',
            'klimmeck://auth ',
            'klimmeck://auth\n',
            'javascript://%0aalert(1)',
            'data://text/html,x',
            'file:///etc/passwd',
            'vbscript://x',
            'blob://x',
            'about://blank',
            'klimmeck_app://auth',
        ])('rejects %p', (value) => {
            expect(() => parseWith({ APP_AUTH_REDIRECT_URL: value })).toThrow(
                /APP_AUTH_REDIRECT_URL/,
            );
        });
    });
});

describe('readAuthEnv', () => {
    it('keeps only the auth keys and stringifies their values', () => {
        expect(
            readAuthEnv({
                JWT_SECRET: 'x',
                OTHER: 'y',
                DEV_AUTH_ENABLED: true,
                TWITCH_CLIENT_ID: undefined,
                TWITCH_CLIENT_SECRET: null,
            }),
        ).toEqual({ JWT_SECRET: 'x', DEV_AUTH_ENABLED: 'true' });
    });
});
