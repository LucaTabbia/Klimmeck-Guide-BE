import {
    normalizedTwitchLoginOf,
    TWITCH_LOGIN_MAX_RAW_LENGTH,
} from 'src/auth/twitch/twitch-login-name';

describe('normalizedTwitchLoginOf', () => {
    it('normalises the username written in an email (D-15)', () => {
        expect(normalizedTwitchLoginOf(' @Some_User ')).toBe('some_user');
        expect(normalizedTwitchLoginOf('a')).toBe('a');
        expect(normalizedTwitchLoginOf('A'.repeat(25))).toBe('a'.repeat(25));
    });

    it.each<[string, string]>([
        ['empty', ''],
        ['only the at sign', '@'],
        ['only spaces', '   '],
        ['a space inside', 'a b'],
        ['a dash', 'user-name'],
        ['a letter outside ASCII', 'ä'],
        ['a sign that lowercases to ASCII', 'Kelvin'],
        ['two at signs', '@@user'],
        ['26 valid characters', 'a'.repeat(26)],
        [
            'more than the raw length cap',
            ` ${'a'.repeat(TWITCH_LOGIN_MAX_RAW_LENGTH)}`,
        ],
    ])('refuses what cannot be a Twitch username: %s (D-15)', (_label, raw) => {
        expect(normalizedTwitchLoginOf(raw)).toBeNull();
    });

    it('caps the raw text at 64 characters before trimming (D-15)', () => {
        expect(TWITCH_LOGIN_MAX_RAW_LENGTH).toBe(64);
        const padded = `${' '.repeat(TWITCH_LOGIN_MAX_RAW_LENGTH - 4)}user`;

        expect(normalizedTwitchLoginOf(padded)).toBe('user');
        expect(normalizedTwitchLoginOf(`${padded} `)).toBeNull();
    });
});
