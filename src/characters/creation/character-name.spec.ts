import {
    isValidCharacterName,
    normalizeCharacterName,
} from 'src/characters/creation/character-name';

// 20 lettere del piano astrale (Deseret): 40 unità UTF-16 ma 20 grafemi, il massimo legittimo
const ASTRAL_LETTERS_NAME = '\u{10400}'.repeat(20);
// 100 jamo hangul + 'a': 2 grafemi (GB6 non spezza mai L × L) ma 101 unità UTF-16
const JAMO_CLUSTER_NAME = 'ᄀ'.repeat(100) + 'a';

describe('normalizeCharacterName', () => {
    it.each([
        ['  Aria  ', 'Aria'],
        ['Aria   di\tLuna', 'Aria di Luna'],
        ['Élodie', 'Élodie'],
        ['D’Arcy', "D'Arcy"],
        ['Ana Maria', 'Ana Maria'],
        ['DʼArcy', "D'Arcy"],
        ['Hawaiʻi', "Hawai'i"],
    ])('normalizes %p to %p', (raw, expected) => {
        expect(normalizeCharacterName(raw)).toBe(expected);
    });
});

describe('isValidCharacterName', () => {
    it.each([
        'Aria',
        'Al',
        'Jean-Luc',
        "D'Arcy",
        'Élodie',
        'Ζωή',
        'Олег',
        '李小龍',
        'Aria di Luna',
        'A'.repeat(20),
        ASTRAL_LETTERS_NAME,
        'スーパー',
    ])('accepts %p', (name) => {
        expect(isValidCharacterName(name)).toBe(true);
    });

    it.each([
        '',
        'A',
        'A'.repeat(21),
        'Aria2',
        'Aria!',
        'Aria_',
        'Aria\u{1F600}',
        '--',
        "''",
        "- '",
        'Ar‍ia',
        'Élodie',
        'D’Arcy',
        JAMO_CLUSTER_NAME,
        'ʼʼ',
        'ˈˌ',
        'ـــ',
        'ーー',
    ])('rejects %p', (name) => {
        expect(isValidCharacterName(name)).toBe(false);
    });
});
