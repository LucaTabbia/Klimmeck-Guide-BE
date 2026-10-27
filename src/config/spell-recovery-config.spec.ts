import {
    DEFAULT_SPELL_RECOVERY_SWEEP_INTERVAL_MS,
    parseSpellRecoveryConfig,
    readSpellRecoveryEnv,
} from 'src/config/spell-recovery-config';

const INVALID_MESSAGE =
    'SPELL_RECOVERY_SWEEP_INTERVAL_MS must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)';

describe('parseSpellRecoveryConfig', () => {
    it('defaults to 60 000 ms', () => {
        expect(DEFAULT_SPELL_RECOVERY_SWEEP_INTERVAL_MS).toBe(60_000);
    });

    it.each([
        {},
        { SPELL_RECOVERY_SWEEP_INTERVAL_MS: '' },
        { SPELL_RECOVERY_SWEEP_INTERVAL_MS: '  ' },
    ])('uses the default when the variable is empty (%p)', (env) => {
        expect(parseSpellRecoveryConfig(env)).toEqual({
            sweepIntervalMs: 60_000,
        });
    });

    it('accepts 0 to disable the periodic sweep', () => {
        expect(
            parseSpellRecoveryConfig({ SPELL_RECOVERY_SWEEP_INTERVAL_MS: '0' }),
        ).toEqual({
            sweepIntervalMs: 0,
        });
    });

    it('accepts an integer interval', () => {
        expect(
            parseSpellRecoveryConfig({
                SPELL_RECOVERY_SWEEP_INTERVAL_MS: '120000',
            }),
        ).toEqual({ sweepIntervalMs: 120_000 });
    });

    it.each(['-1', '1.5', 'abc', '2147483648'])(
        'rejects %p without echoing the value',
        (value) => {
            let thrown: unknown;
            try {
                parseSpellRecoveryConfig({
                    SPELL_RECOVERY_SWEEP_INTERVAL_MS: value,
                });
            } catch (error) {
                thrown = error;
            }

            expect(thrown).toBeInstanceOf(Error);
            expect((thrown as Error).message).toBe(INVALID_MESSAGE);
            expect((thrown as Error).message).not.toContain(value);
        },
    );
});

describe('readSpellRecoveryEnv', () => {
    it('keeps only the spell recovery key as a string', () => {
        expect(
            readSpellRecoveryEnv({
                SPELL_RECOVERY_SWEEP_INTERVAL_MS: '5',
                OTHER: 'x',
            }),
        ).toEqual({ SPELL_RECOVERY_SWEEP_INTERVAL_MS: '5' });
    });
});
