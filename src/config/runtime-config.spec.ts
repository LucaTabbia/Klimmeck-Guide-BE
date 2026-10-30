import { parseRuntimeConfig, readRuntimeEnv } from 'src/config/runtime-config';

const UNKNOWN_MODE_MESSAGE =
    'NODE_ENV must be one of development, test, production (staging uses production)';

describe('parseRuntimeConfig', () => {
    it.each([
        ['development', false],
        ['test', false],
        ['production', true],
    ])('accepts NODE_ENV=%s (D-05)', (mode, production) => {
        expect(parseRuntimeConfig({ NODE_ENV: mode })).toEqual({
            mode,
            production,
            modeDefaulted: false,
        });
    });

    it('defaults an empty NODE_ENV to development (D-05)', () => {
        const defaulted = {
            mode: 'development',
            production: false,
            modeDefaulted: true,
        };

        expect(parseRuntimeConfig({})).toEqual(defaulted);
        expect(parseRuntimeConfig({ NODE_ENV: '  ' })).toEqual(defaulted);
    });

    it('trims the surrounding whitespace of NODE_ENV (D-05)', () => {
        expect(parseRuntimeConfig({ NODE_ENV: ' production ' })).toEqual({
            mode: 'production',
            production: true,
            modeDefaulted: false,
        });
    });

    it('refuses any other NODE_ENV without echoing it (C20)', () => {
        expect(() => parseRuntimeConfig({ NODE_ENV: 'staging' })).toThrow(
            new Error(UNKNOWN_MODE_MESSAGE),
        );
    });
});

describe('readRuntimeEnv', () => {
    it('reads only NODE_ENV from the source', () => {
        expect(
            readRuntimeEnv({ NODE_ENV: 'test', JWT_SECRET: 'fake-secret' }),
        ).toEqual({ NODE_ENV: 'test' });
    });
});
