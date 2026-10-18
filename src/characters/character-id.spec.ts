import { Types } from 'mongoose';
import { requireCharacterObjectId } from './character-id';

describe('requireCharacterObjectId', () => {
    it('returns the ObjectId of a canonical hex id', () => {
        const id = requireCharacterObjectId('64b0000000000000000000aa');

        expect(id).toBeInstanceOf(Types.ObjectId);
        expect(id.toHexString()).toBe('64b0000000000000000000aa');
    });

    it.each(['abc', '', '64B0000000000000000000AA'])(
        'answers NOT_FOUND for the malformed id %p',
        (id) => {
            expect(() => requireCharacterObjectId(id)).toThrow(
                expect.objectContaining({ code: 'NOT_FOUND' }),
            );
        },
    );
});
