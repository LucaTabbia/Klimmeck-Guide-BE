import { towardsCity } from 'src/content/generation/italian';

describe('towardsCity', () => {
    it.each([
        ['Altaluce', 'ad Altaluce'],
        ['anden', 'ad anden'],
        ['Àrvora', 'ad Àrvora'],
    ])('uses the euphonic «ad» before the same vowel: %s', (city, expected) => {
        expect(towardsCity(city)).toBe(expected);
    });

    it.each([
        ['Iriesa', 'a Iriesa'],
        ['Efragos', 'a Efragos'],
        ['Oldcairn', 'a Oldcairn'],
        ['Ultima', 'a Ultima'],
        ['Brina', 'a Brina'],
    ])('keeps a plain «a» before any other letter: %s', (city, expected) => {
        expect(towardsCity(city)).toBe(expected);
    });
});
