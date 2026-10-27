import { Types } from 'mongoose';
import {
    activeRegistrantFilterOf,
    placeholderMarkOf,
    startedQuestResetOf,
    unstartedSeatReleaseOf,
} from './seat-release';

describe('seat release on archive («Il BE non libera i posti delle quest avviate»)', () => {
    const c = new Types.ObjectId();
    const q1 = new Types.ObjectId();
    const q2 = new Types.ObjectId();
    const now = new Date('2026-10-27T12:00:00.000Z');

    it('frees the seat only on quests not started yet', () => {
        expect(unstartedSeatReleaseOf([q1, q2], c)).toEqual({
            filter: { _id: { $in: [q1, q2] }, startedAt: null },
            update: {
                $pull: {
                    registeredAdventurers: {
                        character: { $in: [c, c.toHexString()] },
                    },
                },
            },
        });
    });

    it('marks the seat of a started quest as a placeholder', () => {
        expect(placeholderMarkOf([q1], c, now)).toEqual({
            filter: {
                _id: { $in: [q1] },
                concludedAt: null,
                startedAt: { $ne: null },
            },
            update: {
                $set: { 'registeredAdventurers.$[seat].archivedAt': now },
            },
            arrayFilters: [{ 'seat.character': { $in: [c, c.toHexString()] } }],
        });
    });

    it('returns a started quest without active registrants to not started', () => {
        expect(startedQuestResetOf(q1)).toEqual({
            filter: { _id: q1, concludedAt: null, startedAt: { $ne: null } },
            update: { $set: { startedAt: null, registeredAdventurers: [] } },
        });
    });

    it('looks for an active character among every form of the registered ids', () => {
        const a = new Types.ObjectId();
        const b = new Types.ObjectId();
        expect(
            activeRegistrantFilterOf([
                { character: a },
                { character: b.toHexString() },
                { character: 'not-an-id' },
            ]),
        ).toEqual({
            deletedAt: null,
            _id: { $in: [a, a.toHexString(), b, b.toHexString()] },
        });
    });

    it('finds no active registrant in an empty roster', () => {
        expect(activeRegistrantFilterOf([])).toEqual({
            deletedAt: null,
            _id: { $in: [] },
        });
    });
});
