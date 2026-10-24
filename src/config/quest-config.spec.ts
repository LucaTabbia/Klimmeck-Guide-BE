import {
    DEFAULT_QUEST_SWEEP_INTERVAL_MS,
    parseQuestConfig,
    readQuestEnv,
} from 'src/config/quest-config';

const INVALID_MESSAGE =
    'QUEST_SWEEP_INTERVAL_MS must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)';

describe('parseQuestConfig', () => {
    it('defaults to 60 000 ms', () => {
        expect(DEFAULT_QUEST_SWEEP_INTERVAL_MS).toBe(60_000);
    });

    it.each([
        {},
        { QUEST_SWEEP_INTERVAL_MS: '' },
        { QUEST_SWEEP_INTERVAL_MS: '  ' },
    ])('uses the default when the variable is empty (%p)', (env) => {
        expect(parseQuestConfig(env)).toEqual({ sweepIntervalMs: 60_000 });
    });

    it('accepts 0 to disable the periodic sweep', () => {
        expect(parseQuestConfig({ QUEST_SWEEP_INTERVAL_MS: '0' })).toEqual({
            sweepIntervalMs: 0,
        });
    });

    it('accepts an integer interval', () => {
        expect(parseQuestConfig({ QUEST_SWEEP_INTERVAL_MS: '120000' })).toEqual(
            { sweepIntervalMs: 120_000 },
        );
    });

    it.each(['-1', '1.5', 'abc', '2147483648'])(
        'rejects %p without echoing the value',
        (value) => {
            let thrown: unknown;
            try {
                parseQuestConfig({ QUEST_SWEEP_INTERVAL_MS: value });
            } catch (error) {
                thrown = error;
            }

            expect(thrown).toBeInstanceOf(Error);
            expect((thrown as Error).message).toBe(INVALID_MESSAGE);
            expect((thrown as Error).message).not.toContain(value);
        },
    );
});

describe('readQuestEnv', () => {
    it('keeps only the quest key as a string', () => {
        expect(
            readQuestEnv({ QUEST_SWEEP_INTERVAL_MS: '5', OTHER: 'x' }),
        ).toEqual({ QUEST_SWEEP_INTERVAL_MS: '5' });
    });
});
