import {
    CODE_CHALLENGE_PATTERN,
    CODE_VERIFIER_PATTERN,
    generateOpaqueToken,
    s256Challenge,
    safeEqual,
    sha256Hex,
} from 'src/auth/crypto/token-crypto';

const RFC_7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_7636_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('token crypto helpers', () => {
    describe('s256Challenge', () => {
        it('matches the RFC 7636 Appendix B test vector', () => {
            expect(s256Challenge(RFC_7636_VERIFIER)).toBe(RFC_7636_CHALLENGE);
        });
    });

    describe('generateOpaqueToken', () => {
        it('returns a 43-char base64url token', () => {
            const token = generateOpaqueToken();

            expect(token).toHaveLength(43);
            expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        });

        it('returns a different value on every call', () => {
            expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
        });
    });

    describe('sha256Hex', () => {
        it('returns the hex SHA-256 digest', () => {
            expect(sha256Hex('abc')).toBe(
                'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
            );
        });
    });

    describe('safeEqual', () => {
        it('is true for equal values', () => {
            expect(safeEqual('a', 'a')).toBe(true);
        });

        it('is false for different values', () => {
            expect(safeEqual('a', 'b')).toBe(false);
        });

        it('is false for values of different length without throwing', () => {
            expect(() =>
                safeEqual('short', 'a-much-longer-value'),
            ).not.toThrow();
            expect(safeEqual('short', 'a-much-longer-value')).toBe(false);
        });
    });

    describe('CODE_CHALLENGE_PATTERN', () => {
        it('accepts the RFC 7636 challenge', () => {
            expect(CODE_CHALLENGE_PATTERN.test(RFC_7636_CHALLENGE)).toBe(true);
        });

        it('rejects too short and too long values', () => {
            expect(CODE_CHALLENGE_PATTERN.test('too-short')).toBe(false);
            expect(CODE_CHALLENGE_PATTERN.test('a'.repeat(44))).toBe(false);
        });
    });

    describe('CODE_VERIFIER_PATTERN', () => {
        it('accepts 43 and 128 chars', () => {
            expect(CODE_VERIFIER_PATTERN.test('a'.repeat(43))).toBe(true);
            expect(CODE_VERIFIER_PATTERN.test('a'.repeat(128))).toBe(true);
        });

        it('rejects 42 and 129 chars', () => {
            expect(CODE_VERIFIER_PATTERN.test('a'.repeat(42))).toBe(false);
            expect(CODE_VERIFIER_PATTERN.test('a'.repeat(129))).toBe(false);
        });

        it('rejects characters outside the unreserved set', () => {
            expect(CODE_VERIFIER_PATTERN.test(`${'a'.repeat(42)}+`)).toBe(
                false,
            );
            expect(CODE_VERIFIER_PATTERN.test(`${'a'.repeat(42)}/`)).toBe(
                false,
            );
        });
    });
});
