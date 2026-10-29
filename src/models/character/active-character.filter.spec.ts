import { Types } from 'mongoose';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
    CURRENT_CHARACTER_LINK_FILTER,
} from 'src/models/character/active-character.filter';

describe('active character filter', () => {
    const hex = '64b0000000000000000000aa';

    it('matches only characters that are not archived', () => {
        expect(ACTIVE_CHARACTER_FILTER).toEqual({ deletedAt: null });
    });

    it('scopes a string id to active characters', () => {
        expect(activeCharacterById(hex)).toEqual({
            _id: hex,
            deletedAt: null,
        });
    });

    it('keeps the ObjectId instance passed in', () => {
        const id = new Types.ObjectId(hex);

        const filter = activeCharacterById(id);

        expect(filter._id).toBe(id);
        expect(filter.deletedAt).toBeNull();
    });

    it('returns a new object on every call', () => {
        const filter: Record<string, unknown> = activeCharacterById(hex);

        filter.deletedAt = new Date();

        expect(ACTIVE_CHARACTER_FILTER).toEqual({ deletedAt: null });
        expect(activeCharacterById(hex)).toEqual({
            _id: hex,
            deletedAt: null,
        });
    });

    it('lets the current link resolve a character archived by death', () => {
        expect(CURRENT_CHARACTER_LINK_FILTER).toEqual({
            $or: [{ deletedAt: null }, { deletionReason: 'death' }],
        });
    });
});
