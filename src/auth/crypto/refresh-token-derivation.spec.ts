import {
    deriveRefreshToken,
    deriveRefreshTokenKey,
} from 'src/auth/crypto/refresh-token-derivation';

const SECRET = 'refresh-derivation-secret-0123456789abcdef';
const OTHER_SECRET = 'another-derivation-secret-0123456789abcdef';
const SESSION_ID = '64b0000000000000000000c1';
const TOKEN_SEED = 'per-session-seed';
const KEY_BYTES = 32;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

describe('refresh token derivation', () => {
    describe('deriveRefreshTokenKey', () => {
        it('derives the same 32-byte key from the same secret', () => {
            const key = deriveRefreshTokenKey(SECRET);

            expect(key).toHaveLength(KEY_BYTES);
            expect(key.equals(deriveRefreshTokenKey(SECRET))).toBe(true);
        });

        it('never uses the secret itself as the key (domain separation)', () => {
            const key = deriveRefreshTokenKey(SECRET);

            expect(key.equals(Buffer.from(SECRET).subarray(0, KEY_BYTES))).toBe(
                false,
            );
            expect(key.toString('utf8')).not.toContain(SECRET);
        });

        it('derives different keys from different secrets', () => {
            expect(
                deriveRefreshTokenKey(SECRET).equals(
                    deriveRefreshTokenKey(OTHER_SECRET),
                ),
            ).toBe(false);
        });
    });

    describe('deriveRefreshToken', () => {
        const key = deriveRefreshTokenKey(SECRET);

        it('returns a 43-char base64url token', () => {
            expect(deriveRefreshToken(key, SESSION_ID, 0, TOKEN_SEED)).toMatch(
                OPAQUE_TOKEN_PATTERN,
            );
        });

        it('is deterministic for the same inputs', () => {
            expect(deriveRefreshToken(key, SESSION_ID, 3, TOKEN_SEED)).toBe(
                deriveRefreshToken(key, SESSION_ID, 3, TOKEN_SEED),
            );
        });

        it.each([
            [
                'the key',
                () =>
                    deriveRefreshToken(
                        deriveRefreshTokenKey(OTHER_SECRET),
                        SESSION_ID,
                        3,
                        TOKEN_SEED,
                    ),
            ],
            [
                'the session id',
                () =>
                    deriveRefreshToken(
                        key,
                        '64b0000000000000000000c2',
                        3,
                        TOKEN_SEED,
                    ),
            ],
            [
                'the rotation count',
                () => deriveRefreshToken(key, SESSION_ID, 4, TOKEN_SEED),
            ],
            [
                'the token seed',
                () => deriveRefreshToken(key, SESSION_ID, 3, 'other-seed'),
            ],
        ] as const)('changes when %s changes', (_input, deriveVariant) => {
            expect(deriveVariant()).not.toBe(
                deriveRefreshToken(key, SESSION_ID, 3, TOKEN_SEED),
            );
        });

        it('keeps the inputs unambiguous', () => {
            expect(deriveRefreshToken(key, 'a', 12, 'x')).not.toBe(
                deriveRefreshToken(key, 'a:1', 2, 'x'),
            );
        });
    });
});
