import { createHmac } from 'node:crypto';
import {
    MAX_FUTURE_SKEW_MS,
    REPLAY_WINDOW_MS,
    verifyEventSubSignature,
} from 'src/eventsub/eventsub-signature';
import { TEST_EVENTSUB_SECRET } from '../../test/eventsub/eventsub-fixtures';

const NOW = new Date('2026-10-19T17:10:00.000Z');
const BODY = '{"b":1,  "a":"x"}';
const ID = 'msg-1';
const TS = '2026-10-19T17:09:43.226869Z';

function sign(timestamp: string, secret = TEST_EVENTSUB_SECRET): string {
    return (
        'sha256=' +
        createHmac('sha256', secret)
            .update(ID + timestamp + BODY)
            .digest('hex')
    );
}

function headersAt(timestamp: string, signature = sign(timestamp)) {
    return { messageId: ID, timestamp, signature };
}

function offsetFromNow(ms: number): string {
    return new Date(NOW.getTime() + ms).toISOString();
}

function verify(
    headers = headersAt(TS),
    rawBody: Buffer | undefined = Buffer.from(BODY),
    secret = TEST_EVENTSUB_SECRET,
): boolean {
    return verifyEventSubSignature(headers, rawBody, secret, NOW);
}

describe('verifyEventSubSignature', () => {
    it('accepts a valid signature over the raw bytes', () => {
        expect(verify()).toBe(true);
    });

    it('rejects the same body serialized canonically', () => {
        const canonical = Buffer.from(
            JSON.stringify(JSON.parse(BODY) as unknown),
        );
        expect(verify(headersAt(TS), canonical)).toBe(false);
    });

    it('rejects a signature with one hex digit changed', () => {
        const signature = sign(TS);
        const last = signature.at(-1) === '0' ? '1' : '0';
        expect(verify(headersAt(TS, signature.slice(0, -1) + last))).toBe(
            false,
        );
    });

    it('rejects a signature without the sha256= prefix', () => {
        expect(verify(headersAt(TS, sign(TS).slice('sha256='.length)))).toBe(
            false,
        );
    });

    it('rejects a signature of a different length without throwing', () => {
        expect(() => verify(headersAt(TS, 'sha256=abc'))).not.toThrow();
        expect(verify(headersAt(TS, 'sha256=abc'))).toBe(false);
    });

    it('rejects a missing raw body', () => {
        expect(
            verifyEventSubSignature(
                headersAt(TS),
                undefined,
                TEST_EVENTSUB_SECRET,
                NOW,
            ),
        ).toBe(false);
    });

    it('rejects an empty secret', () => {
        expect(verify(headersAt(TS), Buffer.from(BODY), '')).toBe(false);
    });

    it('rejects a signature made with a different secret', () => {
        expect(
            verify(headersAt(TS, sign(TS, 'another-secret-0123456789'))),
        ).toBe(false);
    });

    it.each([
        ['9 minutes old', -9 * 60 * 1000, true],
        ['11 minutes old', -11 * 60 * 1000, false],
        ['59 seconds in the future', 59 * 1000, true],
        ['61 seconds in the future', 61 * 1000, false],
    ])('timestamp %s → %s', (_label, offset, expected) => {
        expect(verify(headersAt(offsetFromNow(offset)))).toBe(expected);
    });

    it('rejects an unparsable timestamp', () => {
        expect(verify(headersAt('not-a-date'))).toBe(false);
    });

    it('accepts a timestamp with nine fractional digits', () => {
        expect(verify(headersAt('2026-10-19T17:09:43.634234626Z'))).toBe(true);
    });

    it('uses a 10 minute replay window and 60 s of future skew', () => {
        expect(REPLAY_WINDOW_MS).toBe(600_000);
        expect(MAX_FUTURE_SKEW_MS).toBe(60_000);
    });
});
