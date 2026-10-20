import { LogThrottle } from 'src/eventsub/log-throttle';

const INTERVAL_MS = 60_000;
const START = new Date('2026-10-20T12:00:00.000Z');

function after(milliseconds: number): Date {
    return new Date(START.getTime() + milliseconds);
}

describe('LogThrottle', () => {
    it('admits the first message with nothing suppressed', () => {
        expect(new LogThrottle(INTERVAL_MS).admit(START)).toBe(0);
    });

    it('suppresses messages inside the interval', () => {
        const throttle = new LogThrottle(INTERVAL_MS);
        throttle.admit(START);

        expect(throttle.admit(START)).toBeNull();
        expect(throttle.admit(after(INTERVAL_MS - 1))).toBeNull();
    });

    it('admits again once the interval has passed, reporting the suppressed count', () => {
        const throttle = new LogThrottle(INTERVAL_MS);
        throttle.admit(START);
        throttle.admit(after(1));
        throttle.admit(after(2));

        expect(throttle.admit(after(INTERVAL_MS))).toBe(2);
        expect(throttle.admit(after(INTERVAL_MS + 1))).toBeNull();
        expect(throttle.admit(after(2 * INTERVAL_MS))).toBe(1);
    });
});
