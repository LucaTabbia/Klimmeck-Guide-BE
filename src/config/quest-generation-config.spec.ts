import {
    DEFAULT_QUEST_GENERATION_SWEEP_INTERVAL_MS,
    MAX_QUEST_GENERATION_TARGET,
    QUEST_GENERATION_ENV_KEYS,
    parseQuestGenerationConfig,
    readQuestGenerationEnv,
} from 'src/config/quest-generation-config';

const INVALID_INTERVAL =
    'QUEST_GENERATION_SWEEP_INTERVAL_MS must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)';
const INVALID_TARGET =
    'QUEST_GENERATION_TARGET must be an integer between 0 and 10000 (empty = one generated quest per city)';

function errorOf(work: () => unknown): Error {
    try {
        work();
    } catch (error) {
        return error as Error;
    }
    throw new Error('expected the parse to throw');
}

describe('parseQuestGenerationConfig', () => {
    it.each([
        {},
        { QUEST_GENERATION_SWEEP_INTERVAL_MS: '' },
        { QUEST_GENERATION_SWEEP_INTERVAL_MS: '  ' },
    ])('defaults the generation sweep to one hour (D-17) (%p)', (env) => {
        expect(DEFAULT_QUEST_GENERATION_SWEEP_INTERVAL_MS).toBe(3_600_000);
        expect(parseQuestGenerationConfig(env).sweepIntervalMs).toBe(3_600_000);
    });

    it('accepts 0 to disable the periodic generation sweep (D-17)', () => {
        expect(
            parseQuestGenerationConfig({
                QUEST_GENERATION_SWEEP_INTERVAL_MS: '0',
            }),
        ).toEqual({ sweepIntervalMs: 0, target: null });
    });

    it.each(['-1', '1.5', 'abc', '2147483648'])(
        'rejects a malformed interval without echoing the value (D-17) (%p)',
        (value) => {
            const error = errorOf(() =>
                parseQuestGenerationConfig({
                    QUEST_GENERATION_SWEEP_INTERVAL_MS: value,
                }),
            );

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe(INVALID_INTERVAL);
            expect(error.message).not.toContain(value);
        },
    );

    it.each([
        {},
        { QUEST_GENERATION_TARGET: '' },
        { QUEST_GENERATION_TARGET: ' ' },
    ])('defaults the target to the number of cities (D-15) (%p)', (env) => {
        expect(parseQuestGenerationConfig(env)).toEqual({
            sweepIntervalMs: 3_600_000,
            target: null,
        });
    });

    it.each([
        ['0', 0],
        ['167', 167],
        ['10000', 10_000],
    ])('accepts a target from 0 to 10000 (D-15) (%p)', (raw, target) => {
        expect(MAX_QUEST_GENERATION_TARGET).toBe(10_000);
        expect(
            parseQuestGenerationConfig({ QUEST_GENERATION_TARGET: raw }).target,
        ).toBe(target);
    });

    it.each(['-1', '1.5', 'abc', '10001'])(
        'rejects a malformed target without echoing the value (D-15) (%p)',
        (value) => {
            const error = errorOf(() =>
                parseQuestGenerationConfig({ QUEST_GENERATION_TARGET: value }),
            );

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe(INVALID_TARGET);
            expect(error.message).not.toContain(value);
        },
    );
});

describe('readQuestGenerationEnv', () => {
    it('keeps only the generation keys as strings', () => {
        expect([...QUEST_GENERATION_ENV_KEYS].sort()).toEqual([
            'QUEST_GENERATION_SWEEP_INTERVAL_MS',
            'QUEST_GENERATION_TARGET',
        ]);
        expect(
            readQuestGenerationEnv({
                QUEST_GENERATION_SWEEP_INTERVAL_MS: 5,
                QUEST_GENERATION_TARGET: '12',
                OTHER: 'x',
            }),
        ).toEqual({
            QUEST_GENERATION_SWEEP_INTERVAL_MS: '5',
            QUEST_GENERATION_TARGET: '12',
        });
    });
});
