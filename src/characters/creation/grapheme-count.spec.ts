import { countGraphemes } from 'src/characters/creation/grapheme-count';

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
