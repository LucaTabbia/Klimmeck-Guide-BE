import {
    DEFAULT_TRAVEL_SWEEP_INTERVAL_MS,
    parseTravelConfig,
    readTravelEnv,
} from 'src/config/travel-config';

const INVALID_MESSAGE =
    'TRAVEL_SWEEP_INTERVAL_MS must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)';

describe('parseTravelConfig', () => {
    it('defaults to 60 000 ms', () => {
        expect(DEFAULT_TRAVEL_SWEEP_INTERVAL_MS).toBe(60_000);
    });

    it.each([
        {},
        { TRAVEL_SWEEP_INTERVAL_MS: '' },
        { TRAVEL_SWEEP_INTERVAL_MS: '   ' },
    ])('uses the default when the variable is empty (%p)', (env) => {
        expect(parseTravelConfig(env)).toEqual({ sweepIntervalMs: 60_000 });
    });

    it('accepts 0 to disable the periodic sweep', () => {
        expect(parseTravelConfig({ TRAVEL_SWEEP_INTERVAL_MS: '0' })).toEqual({
            sweepIntervalMs: 0,
        });
    });

    it('accepts an integer interval', () => {
        expect(
            parseTravelConfig({ TRAVEL_SWEEP_INTERVAL_MS: '30000' }),
        ).toEqual({ sweepIntervalMs: 30_000 });
    });

    it('accepts the largest timer delay', () => {
        expect(
            parseTravelConfig({ TRAVEL_SWEEP_INTERVAL_MS: '2147483647' }),
        ).toEqual({ sweepIntervalMs: 2_147_483_647 });
    });

    it.each(['-1', '1.5', 'abc', '60s', '2147483648', '1e3'])(
        'rejects %p without echoing the value',
        (value) => {
            let thrown: unknown;
            try {
                parseTravelConfig({ TRAVEL_SWEEP_INTERVAL_MS: value });
            } catch (error) {
                thrown = error;
            }

            expect(thrown).toBeInstanceOf(Error);
            expect((thrown as Error).message).toBe(INVALID_MESSAGE);
            expect((thrown as Error).message).not.toContain(value);
        },
    );
});

describe('readTravelEnv', () => {
    it('keeps only the travel key as a string', () => {
        expect(
            readTravelEnv({ TRAVEL_SWEEP_INTERVAL_MS: 5000, OTHER: 'x' }),
        ).toEqual({ TRAVEL_SWEEP_INTERVAL_MS: '5000' });
    });
});
