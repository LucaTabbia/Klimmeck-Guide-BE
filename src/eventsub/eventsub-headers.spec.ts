import { readEventSubHeaders } from 'src/eventsub/eventsub-headers';

const SIGNATURE = 'sha256=' + 'a'.repeat(64);
const VALID: Record<string, string> = {
    'twitch-eventsub-message-id': 'msg-1',
    'twitch-eventsub-message-timestamp': '2026-10-19T17:09:43.226869Z',
    'twitch-eventsub-message-signature': SIGNATURE,
    'twitch-eventsub-message-type': 'notification',
    'content-type': 'application/json',
};
const REQUIRED_HEADERS = [
    'twitch-eventsub-message-id',
    'twitch-eventsub-message-timestamp',
    'twitch-eventsub-message-signature',
    'twitch-eventsub-message-type',
];

function withoutHeader(name: string): Record<string, string> {
    const headers = { ...VALID };
    delete headers[name];
    return headers;
}

describe('readEventSubHeaders', () => {
    it('reads the four signed message headers', () => {
        expect(readEventSubHeaders(VALID)).toEqual({
            messageId: 'msg-1',
            timestamp: '2026-10-19T17:09:43.226869Z',
            signature: SIGNATURE,
            messageType: 'notification',
        });
    });

    it.each(REQUIRED_HEADERS)('returns null when %s is missing', (name) => {
        expect(readEventSubHeaders(withoutHeader(name))).toBeNull();
    });

    it.each(REQUIRED_HEADERS)('returns null when %s is empty', (name) => {
        expect(readEventSubHeaders({ ...VALID, [name]: '' })).toBeNull();
    });

    it.each(REQUIRED_HEADERS)('returns null when %s is duplicated', (name) => {
        expect(
            readEventSubHeaders({ ...VALID, [name]: ['a', 'b'] }),
        ).toBeNull();
    });

    it.each(REQUIRED_HEADERS)(
        'returns null when %s is longer than 200 characters',
        (name) => {
            expect(
                readEventSubHeaders({ ...VALID, [name]: 'x'.repeat(201) }),
            ).toBeNull();
        },
    );

    it('ignores extra headers', () => {
        expect(
            readEventSubHeaders({
                ...VALID,
                'twitch-eventsub-message-retry': '0',
                'twitch-eventsub-subscription-type': 'stream.offline',
            }),
        ).toEqual(readEventSubHeaders(VALID));
    });

    it('returns null without throwing on empty headers', () => {
        expect(() => readEventSubHeaders({})).not.toThrow();
        expect(readEventSubHeaders({})).toBeNull();
    });
});
