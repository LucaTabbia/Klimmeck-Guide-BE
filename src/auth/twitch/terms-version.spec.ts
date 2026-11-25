import { isTermsVersion } from 'src/auth/twitch/terms-version';

const LONGEST_VERSION = `v${'1'.repeat(31)}`;
const TOO_LONG_VERSION = `v${'1'.repeat(32)}`;

describe('isTermsVersion', () => {
    it.each(['2026-11-24', 'v1', '1.0.0', 'a_b-c.d', LONGEST_VERSION])(
        'accepts the version shapes the app sends (D-19): %s',
        (version) => {
            expect(isTermsVersion(version)).toBe(true);
        },
    );

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty string', ''],
        ['a leading space', ' 2026'],
        ['a leading dash', '-1'],
        ['a leading dot', '.v'],
        ['slashes', '2026/11/24'],
        ['33 characters', TOO_LONG_VERSION],
        ['a number', 20261124],
        ['an array', ['2026-11-24']],
    ])('refuses a missing or malformed version (D-19): %s', (_label, value) => {
        expect(isTermsVersion(value)).toBe(false);
    });
});
