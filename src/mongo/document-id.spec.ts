import { Types } from 'mongoose';
import { documentIdOf, isObjectIdHex } from 'src/mongo/document-id';

describe('documentIdOf', () => {
    it('stringifies an ObjectId _id', () => {
        expect(
            documentIdOf({
                _id: new Types.ObjectId('64b000000000000000000001'),
            }),
        ).toBe('64b000000000000000000001');
    });

    it('returns a string _id as is', () => {
        expect(documentIdOf({ _id: 'abc' })).toBe('abc');
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a document without _id', {}],
        ['a null _id', { _id: null }],
    ])('returns undefined for %s', (_name, document) => {
        expect(documentIdOf(document)).toBeUndefined();
    });
});

describe('isObjectIdHex', () => {
    it.each([
        ['64b000000000000000000001', true],
        ['64B000000000000000000001', false],
        ['abc', false],
        ['aaaaaaaaaaaa', false],
        ['64b00000000000000000000z', false],
    ])('isObjectIdHex(%s) is %s', (value, expected) => {
        expect(isObjectIdHex(value)).toBe(expected);
    });
});
