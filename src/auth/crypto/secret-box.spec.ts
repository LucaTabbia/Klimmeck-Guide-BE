import {
    deriveSecretBoxKey,
    openSecret,
    sealSecret,
} from 'src/auth/crypto/secret-box';

const KEY = deriveSecretBoxKey('s'.repeat(32), 'test-purpose');
const SECRET = 'twitch-refresh-token';

describe('secret box', () => {
    it('opens what it sealed', () => {
        expect(openSecret(sealSecret(SECRET, KEY), KEY)).toBe(SECRET);
    });

    it('never stores the secret in clear and seals differently every time', () => {
        const first = sealSecret(SECRET, KEY);
        const second = sealSecret(SECRET, KEY);

        expect(first).not.toContain(SECRET);
        expect(first).not.toBe(second);
    });

    it('answers null with another key', () => {
        const otherKey = deriveSecretBoxKey('t'.repeat(32), 'test-purpose');

        expect(openSecret(sealSecret(SECRET, KEY), otherKey)).toBeNull();
    });

    it('derives a different key for a different purpose', () => {
        const otherKey = deriveSecretBoxKey('s'.repeat(32), 'other-purpose');

        expect(openSecret(sealSecret(SECRET, KEY), otherKey)).toBeNull();
    });

    it.each(['', 'not-a-sealed-value', 'a.b', 'a.b.c'])(
        'answers null on a malformed value %p',
        (sealed) => {
            expect(openSecret(sealed, KEY)).toBeNull();
        },
    );

    it('answers null on a tampered value', () => {
        const [iv, tag, data] = sealSecret(SECRET, KEY).split('.');
        const tampered = Buffer.from(data, 'base64url');
        tampered[0] ^= 1;

        expect(
            openSecret(
                [iv, tag, tampered.toString('base64url')].join('.'),
                KEY,
            ),
        ).toBeNull();
    });
});
