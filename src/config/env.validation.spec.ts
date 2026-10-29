import { parse } from 'dotenv';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_ENV_KEYS } from 'src/config/auth-config';
import { validateEnv } from 'src/config/env.validation';

const VALID_SECRET = 's'.repeat(40);
const EVENTSUB_SECRET = 'e'.repeat(64);

function encodedServiceAccount(privateKey: string): string {
    return Buffer.from(
        JSON.stringify({
            type: 'service_account',
            project_id: 'klimmeck-test',
            client_email: 'push@klimmeck-test.iam.gserviceaccount.com',
            private_key: privateKey,
        }),
    ).toString('base64');
}

describe('validateEnv', () => {
    it('returns the same env object when valid', () => {
        const env = { JWT_SECRET: VALID_SECRET, PORT: '3000' };

        expect(validateEnv(env)).toBe(env);
    });

    it('refuses to boot with an unknown NODE_ENV (D-05)', () => {
        expect(() =>
            validateEnv({ JWT_SECRET: VALID_SECRET, NODE_ENV: 'staging' }),
        ).toThrow(
            new Error(
                'NODE_ENV must be one of development, test, production (staging uses production)',
            ),
        );
    });

    it('throws when JWT_SECRET is missing', () => {
        expect(() => validateEnv({ PORT: '3000' })).toThrow(/JWT_SECRET/);
    });

    it('throws when the dev bypass is enabled in production', () => {
        expect(() =>
            validateEnv({
                JWT_SECRET: VALID_SECRET,
                NODE_ENV: 'production',
                DEV_AUTH_ENABLED: 'true',
                DEV_AUTH_ACCESS_TOKEN: 'dev-access-token-0123',
                DEV_AUTH_TWITCH_ID: 'dev-twitch-1',
                DEV_AUTH_ROLE: 'adventurer',
            }),
        ).toThrow(/DEV_AUTH_ENABLED/);
    });

    it('boots without any Twitch key', () => {
        expect(() => validateEnv({ JWT_SECRET: VALID_SECRET })).not.toThrow();
    });

    it('throws in production without FIREBASE_SERVICE_ACCOUNT', () => {
        expect(() =>
            validateEnv({ JWT_SECRET: VALID_SECRET, NODE_ENV: 'production' }),
        ).toThrow(/FIREBASE_SERVICE_ACCOUNT/);
    });

    it('boots in development without FIREBASE_SERVICE_ACCOUNT (push disabled)', () => {
        expect(() =>
            validateEnv({ JWT_SECRET: VALID_SECRET, NODE_ENV: 'development' }),
        ).not.toThrow();
    });

    describe('EventSub', () => {
        let encoded: string;

        beforeAll(() => {
            encoded = encodedServiceAccount(
                generateKeyPairSync('rsa', {
                    modulusLength: 2048,
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                }).privateKey,
            );
        });

        it('throws in production without the EventSub variables', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    NODE_ENV: 'production',
                    FIREBASE_SERVICE_ACCOUNT: encoded,
                }),
            ).toThrow(/TWITCH_EVENTSUB_SECRET/);
        });

        it('boots in production with the full EventSub configuration', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    NODE_ENV: 'production',
                    FIREBASE_SERVICE_ACCOUNT: encoded,
                    TWITCH_CLIENT_ID: 'client-id',
                    TWITCH_CLIENT_SECRET: 'client-secret',
                    TWITCH_EVENTSUB_SECRET: EVENTSUB_SECRET,
                    TWITCH_EVENTSUB_CALLBACK_URL:
                        'https://api.klimmeck.test/webhooks/twitch/eventsub',
                    TWITCH_BROADCASTER_ID: '11111',
                }),
            ).not.toThrow();
        });

        it('rejects the partial local EventSub configuration (secret and broadcaster without callback)', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    TWITCH_EVENTSUB_SECRET: EVENTSUB_SECRET,
                    TWITCH_BROADCASTER_ID: '11111',
                }),
            ).toThrow(/TWITCH_EVENTSUB_CALLBACK_URL/);
        });
    });

    describe('travel sweep', () => {
        it('throws on a malformed TRAVEL_SWEEP_INTERVAL_MS', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    TRAVEL_SWEEP_INTERVAL_MS: 'abc',
                }),
            ).toThrow(/TRAVEL_SWEEP_INTERVAL_MS/);
        });

        it('boots with the periodic sweep disabled', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    TRAVEL_SWEEP_INTERVAL_MS: '0',
                }),
            ).not.toThrow();
        });
    });

    describe('quest sweep', () => {
        it('throws on a malformed QUEST_SWEEP_INTERVAL_MS', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    QUEST_SWEEP_INTERVAL_MS: 'abc',
                }),
            ).toThrow(/QUEST_SWEEP_INTERVAL_MS/);
        });

        it('boots with the periodic quest sweep disabled', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    QUEST_SWEEP_INTERVAL_MS: '0',
                }),
            ).not.toThrow();
        });
    });

    describe('spell recovery sweep', () => {
        it('rejects the boot with a malformed SPELL_RECOVERY_SWEEP_INTERVAL_MS', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    SPELL_RECOVERY_SWEEP_INTERVAL_MS: 'abc',
                }),
            ).toThrow(/SPELL_RECOVERY_SWEEP_INTERVAL_MS/);
        });

        it('boots with the periodic spell recovery sweep disabled', () => {
            expect(() =>
                validateEnv({
                    JWT_SECRET: VALID_SECRET,
                    SPELL_RECOVERY_SWEEP_INTERVAL_MS: '0',
                }),
            ).not.toThrow();
        });
    });

    it('rejects a malformed FIREBASE_SERVICE_ACCOUNT in development', () => {
        expect(() =>
            validateEnv({
                JWT_SECRET: VALID_SECRET,
                FIREBASE_SERVICE_ACCOUNT: 'not base64 !!!',
            }),
        ).toThrow(/base64/);
    });
});

describe('.env.example', () => {
    const parsed = parse(readFileSync(join(process.cwd(), '.env.example')));

    it('declares every auth key', () => {
        const requiredKeys = AUTH_ENV_KEYS.filter((key) => key !== 'NODE_ENV');

        for (const key of requiredKeys) {
            expect(parsed).toHaveProperty(key);
        }
    });

    it('carries no JWT secret value', () => {
        expect(parsed.JWT_SECRET).toBe('');
    });

    it('declares an empty FIREBASE_SERVICE_ACCOUNT', () => {
        expect(parsed).toHaveProperty('FIREBASE_SERVICE_ACCOUNT');
        expect(parsed.FIREBASE_SERVICE_ACCOUNT).toBe('');
    });

    it('declares the EventSub and login scope keys empty', () => {
        for (const key of [
            'TWITCH_LOGIN_SCOPES',
            'TWITCH_EVENTSUB_SECRET',
            'TWITCH_EVENTSUB_CALLBACK_URL',
            'TWITCH_BROADCASTER_ID',
        ]) {
            expect(parsed).toHaveProperty(key);
            expect(parsed[key]).toBe('');
        }
    });

    it('declares an empty TRAVEL_SWEEP_INTERVAL_MS', () => {
        expect(parsed).toHaveProperty('TRAVEL_SWEEP_INTERVAL_MS');
        expect(parsed.TRAVEL_SWEEP_INTERVAL_MS).toBe('');
    });

    it('declares an empty QUEST_SWEEP_INTERVAL_MS', () => {
        expect(parsed).toHaveProperty('QUEST_SWEEP_INTERVAL_MS');
        expect(parsed.QUEST_SWEEP_INTERVAL_MS).toBe('');
    });

    it('declares an empty SPELL_RECOVERY_SWEEP_INTERVAL_MS', () => {
        expect(parsed).toHaveProperty('SPELL_RECOVERY_SWEEP_INTERVAL_MS');
        expect(parsed.SPELL_RECOVERY_SWEEP_INTERVAL_MS).toBe('');
    });

    it('passes validateEnv once a JWT_SECRET is provided', () => {
        expect(() =>
            validateEnv({ ...parsed, JWT_SECRET: VALID_SECRET }),
        ).not.toThrow();
    });
});
