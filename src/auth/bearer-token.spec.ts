import { extractBearerToken } from 'src/auth/bearer-token';

describe('extractBearerToken', () => {
    it.each([
        ['Bearer abc.def', 'abc.def'],
        ['bearer abc', 'abc'],
        ['Bearer   abc', 'abc'],
        ['  Bearer abc  ', 'abc'],
    ])('extracts the token from %p', (authorization, expected) => {
        expect(extractBearerToken(authorization)).toBe(expected);
    });

    it.each([
        ['Token abc'],
        ['Bearer '],
        ['Bearer'],
        [''],
        ['Bearer a b'],
        [undefined],
        [null],
        [42],
        [['Bearer x']],
        [{ Authorization: 'Bearer x' }],
    ])('returns null for %p', (authorization) => {
        expect(extractBearerToken(authorization)).toBeNull();
    });
});
