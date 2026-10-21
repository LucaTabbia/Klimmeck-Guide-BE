import { Types } from 'mongoose';
import {
    documentIdOf,
    idForms,
    isObjectIdHex,
    objectIdFromHex,
    refIdOf,
    sameId,
} from 'src/mongo/document-id';

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

describe('objectIdFromHex', () => {
    it('turns a canonical hex id into an ObjectId', () => {
        const id = objectIdFromHex('64b0000000000000000000aa');

        expect(id).toBeInstanceOf(Types.ObjectId);
        expect(id?.toHexString()).toBe('64b0000000000000000000aa');
    });

    it.each([
        ['an uppercase hex id', '64B0000000000000000000AA'],
        ['a short string', 'abc'],
        ['a 12 character string', 'aaaaaaaaaaaa'],
        ['an empty string', ''],
        ['null', null],
        ['undefined', undefined],
    ])('returns null for %s', (_name, value) => {
        expect(objectIdFromHex(value)).toBeNull();
    });
});

describe('sameId', () => {
    const id = new Types.ObjectId('64b0000000000000000000aa');

    it('matches the same ObjectId', () => {
        expect(sameId(new Types.ObjectId(id.toHexString()), id)).toBe(true);
    });

    it('matches a legacy id stored as a hex string', () => {
        expect(sameId(id.toHexString(), id)).toBe(true);
    });

    it.each([
        ['another ObjectId', new Types.ObjectId('64b0000000000000000000bb')],
        ['another string', 'abc'],
        ['null', null],
        ['undefined', undefined],
    ])('does not match %s', (_name, value) => {
        expect(sameId(value, id)).toBe(false);
    });
});

describe('idForms', () => {
    it('lists the ObjectId and its hex string, the two stored forms of a ref', () => {
        const id = new Types.ObjectId('64b0000000000000000000aa');

        expect(idForms(id)).toEqual([id, '64b0000000000000000000aa']);
        expect(idForms(id)[0]).toBeInstanceOf(Types.ObjectId);
    });
});

describe('refIdOf', () => {
    const id = new Types.ObjectId();

    it('returns an ObjectId ref as is', () => {
        expect(refIdOf(id)).toBe(id);
    });

    it('turns a legacy canonical hex ref into an ObjectId', () => {
        expect(refIdOf(id.toHexString())).toEqual(id);
    });

    it.each([
        ['a short string', 'abc'],
        ['null', null],
        ['undefined', undefined],
        ['a number', 42],
        ['an object', {}],
        ['an uppercase hex id', id.toHexString().toUpperCase()],
    ])('returns null for %s', (_name, value) => {
        expect(refIdOf(value)).toBeNull();
    });
});
