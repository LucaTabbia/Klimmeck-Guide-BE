import mongoose from 'mongoose';
import {
    maxActiveSpellsExpression,
    maxActiveSpellsFor,
} from 'src/models/character/active-spell-slots';
import { CharacterStatusSchema } from 'src/models/character/character-status.model';

const SLOTS_BY_XP: Array<[number, number]> = [
    [0, 0],
    [19999, 0],
    [20000, 1],
    [24999, 1],
    [25000, 2],
    [29999, 2],
    [30000, 3],
    [39999, 3],
    [40000, 4],
    [100000, 4],
];

describe('active spell slots', () => {
    it.each(SLOTS_BY_XP)('maxActiveSpellsFor(%i) is %i', (xp, slots) => {
        expect(maxActiveSpellsFor(xp)).toBe(slots);
    });

    it.each(SLOTS_BY_XP)(
        'the maxActiveSpells virtual answers %i xp with %i slots',
        (xp, slots) => {
            const StatusProbe =
                mongoose.models.CharacterStatusSlotsProbe ??
                mongoose.model(
                    'CharacterStatusSlotsProbe',
                    CharacterStatusSchema,
                );

            expect(new StatusProbe({ xp }).get('maxActiveSpells')).toBe(slots);
        },
    );

    it('builds the $switch from the same thresholds', () => {
        const xp = { $ifNull: ['$status.xp', 0] };

        expect(maxActiveSpellsExpression()).toEqual({
            $switch: {
                branches: [
                    { case: { $gte: [xp, 40000] }, then: 4 },
                    { case: { $gte: [xp, 30000] }, then: 3 },
                    { case: { $gte: [xp, 25000] }, then: 2 },
                    { case: { $gte: [xp, 20000] }, then: 1 },
                ],
                default: 0,
            },
        });
    });
});
