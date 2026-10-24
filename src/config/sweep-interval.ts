export const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647; // oltre, setInterval di Node scatta subito
const DIGITS = /^\d+$/;

// opzionale con default, 0 spegne solo lo sweep periodico; fail-closed al boot con un messaggio senza valore
export function parseSweepIntervalMs(
    name: string,
    raw: string | undefined,
): number {
    const value = (raw ?? '').trim();
    if (!value) return DEFAULT_SWEEP_INTERVAL_MS;
    if (!DIGITS.test(value) || Number(value) > MAX_TIMER_MS) {
        throw new Error(
            `${name} must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)`,
        );
    }
    return Number(value);
}
