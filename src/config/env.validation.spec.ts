import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_ENV_KEYS } from 'src/config/auth-config';
import { validateEnv } from 'src/config/env.validation';

const VALID_SECRET = 's'.repeat(40);

describe('validateEnv', () => {
    it('returns the same env object when valid', () => {
        const env = { JWT_SECRET: VALID_SECRET, PORT: '3000' };

        expect(validateEnv(env)).toBe(env);
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

    it('passes validateEnv once a JWT_SECRET is provided', () => {
        expect(() =>
            validateEnv({ ...parsed, JWT_SECRET: VALID_SECRET }),
        ).not.toThrow();
    });
});
