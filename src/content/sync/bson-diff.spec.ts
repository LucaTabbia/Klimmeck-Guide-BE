import { Double, ObjectId } from 'mongodb';
import { changedFields, sameBson } from './bson-diff';

describe('sameBson', () => {
    it('treats a stored double and a sent int32 as different (Pitfall 3)', () => {
        expect(sameBson(new Double(100), 100)).toBe(false);
    });

    it('treats a different subdocument key order as different', () => {
        expect(
            sameBson(
                { copper: 1, silver: 2, gold: 3 },
                { gold: 3, silver: 2, copper: 1 },
            ),
        ).toBe(false);
    });

    it('treats a hex string and an ObjectId as different', () => {
        const id = new ObjectId();
        expect(sameBson(id.toHexString(), id)).toBe(false);
    });

    it('treats null and null as equal', () => {
        expect(sameBson(null, null)).toBe(true);
    });

    it('treats equal ids and equal subdocuments as equal', () => {
        const id = new ObjectId();
        expect(
            sameBson(
                { item: new ObjectId(id.toHexString()), quantity: 2 },
                { item: id, quantity: 2 },
            ),
        ).toBe(true);
    });
});

describe('changedFields', () => {
    it('lists only the changed fields', () => {
        const stored = { name: 'Lupo', xp: new Double(10), tags: ['a'] };
        const next = { name: 'Lupo', xp: 10, tags: ['a', 'b'] };
        expect(changedFields(stored, next)).toEqual(['xp', 'tags']);
    });

    it('lists every field of a missing document', () => {
        expect(changedFields(null, { name: 'Lupo', image: null })).toEqual([
            'name',
            'image',
        ]);
    });

    it('treats a field absent from the stored document as changed, even when null', () => {
        expect(
            changedFields({ name: 'Lupo' }, { name: 'Lupo', image: null }),
        ).toEqual(['image']);
    });

    it('ignores the stored fields the files do not write', () => {
        expect(
            changedFields({ name: 'Lupo', __v: 0 }, { name: 'Lupo' }),
        ).toEqual([]);
    });
});
