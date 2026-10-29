import { reopenDelayMs } from './reopen-backoff';

describe('reopenDelayMs', () => {
    it.each([
        [0, 1000],
        [1, 2000],
        [2, 4000],
        [4, 16000],
        [5, 30000],
        [12, 30000],
    ])(
        'waits %i attempts → %i ms before reopening a change stream (D-17a)',
        (attempt, delayMs) => {
            expect(reopenDelayMs(attempt)).toBe(delayMs);
        },
    );
});
