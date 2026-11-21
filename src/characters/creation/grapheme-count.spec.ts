import {
    countGraphemes,
    exceedsGraphemeLimit,
} from 'src/characters/creation/grapheme-count';

describe('countGraphemes', () => {
    it.each([
        ['', 0],
        ['abc', 3],
        ['É', 1],
        ['\u{1F468}‍\u{1F469}‍\u{1F467}', 1],
        ['Aria di Luna', 12],
    ])('counts %p as %i visible characters', (text, expected) => {
        expect(countGraphemes(text)).toBe(expected);
    });
});

describe('exceedsGraphemeLimit', () => {
    const LIMIT = 1000;
    const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const COMBINING_ACUTE = '\u0301';

    it('accepts a text of exactly the limit (D-07)', () => {
        expect(exceedsGraphemeLimit('a'.repeat(LIMIT), LIMIT)).toBe(false);
    });

    it('refuses one grapheme over the limit (D-07)', () => {
        expect(exceedsGraphemeLimit('a'.repeat(LIMIT + 1), LIMIT)).toBe(true);
    });

    it('counts a ZWJ emoji sequence as one grapheme (D-07)', () => {
        expect(exceedsGraphemeLimit(FAMILY.repeat(LIMIT), LIMIT)).toBe(false);
    });

    it('refuses a cluster of combining marks over the code unit cap (D-07)', () => {
        const cluster = `a${COMBINING_ACUTE.repeat(LIMIT * 8)}`;

        expect(countGraphemes(cluster)).toBe(1);
        expect(exceedsGraphemeLimit(cluster, LIMIT)).toBe(true);
    });

    it('accepts the empty text (D-07)', () => {
        expect(exceedsGraphemeLimit('', LIMIT)).toBe(false);
    });
});
