import { countGraphemes } from 'src/characters/creation/grapheme-count';

export const CHARACTER_NAME_MIN_LENGTH = 2;
export const CHARACTER_NAME_MAX_LENGTH = 20;
const TYPOGRAPHIC_APOSTROPHE = /’/g;
const WHITESPACE_RUN = /\s+/g;
const ALLOWED_NAME_CHARACTERS = /^[\p{L}' -]+$/u;
const ANY_LETTER = /\p{L}/u;

// NFC prima di tutto: una lettera decomposta (U+0301 è \p{M}) fallirebbe \p{L}
export function normalizeCharacterName(raw: string): string {
    return raw
        .normalize('NFC')
        .replace(TYPOGRAPHIC_APOSTROPHE, "'")
        .trim()
        .replace(WHITESPACE_RUN, ' ');
}

export function isValidCharacterName(normalized: string): boolean {
    const length = countGraphemes(normalized);
    return (
        length >= CHARACTER_NAME_MIN_LENGTH &&
        length <= CHARACTER_NAME_MAX_LENGTH &&
        ALLOWED_NAME_CHARACTERS.test(normalized) &&
        ANY_LETTER.test(normalized)
    );
}
