import { BadUserInputException } from 'src/validation/bad-user-input.exception';
import {
    MAX_ID_LIST,
    ObjectIdListPipe,
    ObjectIdPipe,
} from 'src/validation/object-id.pipe';

const VALID_ID = '64b000000000000000000001';

function hexId(index: number): string {
    return index.toString(16).padStart(24, '0');
}

function rejectionOf(run: () => unknown): BadUserInputException {
    try {
        run();
    } catch (error) {
        return error as BadUserInputException;
    }
    throw new Error('expected a rejection');
}

describe('ObjectIdPipe', () => {
    const pipe = new ObjectIdPipe();

    it('returns a well-formed scalar id unchanged (D-02)', () => {
        expect(pipe.transform(VALID_ID, { type: 'custom', data: 'id' })).toBe(
            VALID_ID,
        );
    });

    it('rejects a malformed scalar id with BAD_USER_INPUT (D-02)', () => {
        const rejection = rejectionOf(() =>
            pipe.transform('zz', { type: 'custom', data: 'id' }),
        );

        expect(rejection).toBeInstanceOf(BadUserInputException);
        expect(rejection.fields).toEqual(['id']);
    });

    it('names the argument it guards and falls back to id (D-03)', () => {
        expect(
            rejectionOf(() =>
                pipe.transform(42, { type: 'custom', data: 'characterId' }),
            ).fields,
        ).toEqual(['characterId']);
        expect(
            rejectionOf(() => pipe.transform('zz', { type: 'custom' })).fields,
        ).toEqual(['id']);
    });
});

describe('ObjectIdListPipe', () => {
    const pipe = new ObjectIdListPipe();
    const metadata = { type: 'custom' as const, data: 'ids' };

    it('accepts an empty list and a list of well-formed ids (D-02)', () => {
        expect(pipe.transform([], metadata)).toEqual([]);
        expect(pipe.transform([VALID_ID, hexId(2)], metadata)).toEqual([
            VALID_ID,
            hexId(2),
        ]);
    });

    it('rejects a list with a malformed entry (D-02)', () => {
        expect(
            rejectionOf(() => pipe.transform([VALID_ID, 'zz'], metadata))
                .fields,
        ).toEqual(['ids']);
    });

    it('caps id lists at 100 entries (D-04)', () => {
        const ids = Array.from({ length: MAX_ID_LIST + 1 }, (_, index) =>
            hexId(index + 1),
        );

        expect(MAX_ID_LIST).toBe(100);
        expect(
            pipe.transform(ids.slice(0, MAX_ID_LIST), metadata),
        ).toHaveLength(MAX_ID_LIST);
        expect(rejectionOf(() => pipe.transform(ids, metadata)).fields).toEqual(
            ['ids'],
        );
    });

    it('rejects a value that is not a list (D-02)', () => {
        expect(
            rejectionOf(() => pipe.transform(VALID_ID, metadata)).fields,
        ).toEqual(['ids']);
    });
});
