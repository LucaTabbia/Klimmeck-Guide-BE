import {
    isValidCharacterName,
    normalizeCharacterName,
} from 'src/characters/creation/character-name';

describe('normalizeCharacterName', () => {
    it.each([
        ['  Aria  ', 'Aria'],
        ['Aria   di\tLuna', 'Aria di Luna'],
        ['Élodie', 'Élodie'],
        ['D’Arcy', "D'Arcy"],
        ['Ana Maria', 'Ana Maria'],
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
    ])('rejects %p', (name) => {
        expect(isValidCharacterName(name)).toBe(false);
    });
});
