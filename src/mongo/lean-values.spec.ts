import { stringsOf } from 'src/mongo/lean-values';

describe('stringsOf', () => {
    it('keeps only the strings of an array', () => {
        expect(stringsOf(['forest', 3, null, 'city', { type: 'x' }])).toEqual([
            'forest',
            'city',
        ]);
    });

    it('wraps a bare string in a list', () => {
        expect(stringsOf('forest')).toEqual(['forest']);
    });

    it('reads anything else as an empty list', () => {
        expect(stringsOf(undefined)).toEqual([]);
        expect(stringsOf(null)).toEqual([]);
        expect(stringsOf(42)).toEqual([]);
        expect(stringsOf({ 0: 'forest' })).toEqual([]);
    });
});
