export const REOPEN_BASE_DELAY_MS = 1_000;
export const REOPEN_MAX_DELAY_MS = 30_000;

// backoff esponenziale con tetto (D-17a): 1 s, 2 s, 4 s … al più 30 s
export function reopenDelayMs(attempt: number): number {
    return Math.min(REOPEN_BASE_DELAY_MS * 2 ** attempt, REOPEN_MAX_DELAY_MS);
}
