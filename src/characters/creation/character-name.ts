import { countGraphemes } from 'src/characters/creation/grapheme-count';

export const CHARACTER_NAME_MIN_LENGTH = 2;
export const CHARACTER_NAME_MAX_LENGTH = 20;
// senza segni combinanti (\p{M} vietato) una lettera occupa al più una coppia surrogata:
// il tetto in unità UTF-16 ferma i cluster di lettere (es. jamo) che contano pochi grafemi
export const CHARACTER_NAME_MAX_CODE_UNITS = CHARACTER_NAME_MAX_LENGTH * 2;
// ’ U+2019, ʼ U+02BC e ʻ U+02BB: l'apostrofo tipografico e le due lettere modificatrici identiche a vista (D-19)
const APOSTROPHE_LOOKALIKES = /[’ʼʻ]/g;
const WHITESPACE_RUN = /\s+/g;
const ALLOWED_NAME_CHARACTERS = /^[\p{L}' -]+$/u;
// "almeno una lettera" ignora le modificatrici \p{Lm} (ˈ ˌ ـ ー), che rendono come punteggiatura
const ANY_BASE_LETTER = /[\p{Lu}\p{Ll}\p{Lt}\p{Lo}]/u;

// NFC prima di tutto: una lettera decomposta (U+0301 è \p{M}) fallirebbe \p{L}
export function normalizeCharacterName(raw: string): string {
    return raw
        .normalize('NFC')
        .replace(APOSTROPHE_LOOKALIKES, "'")
        .trim()
        .replace(WHITESPACE_RUN, ' ');
}

export function isValidCharacterName(normalized: string): boolean {
    if (normalized.length > CHARACTER_NAME_MAX_CODE_UNITS) return false;
    const length = countGraphemes(normalized);
    return (
        length >= CHARACTER_NAME_MIN_LENGTH &&
        length <= CHARACTER_NAME_MAX_LENGTH &&
        ALLOWED_NAME_CHARACTERS.test(normalized) &&
        ANY_BASE_LETTER.test(normalized)
    );
}
