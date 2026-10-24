import mongoose from 'mongoose';
import {
    maxActiveSpellsExpression,
    maxActiveSpellsFor,
    SPELL_CASTER_TITLES,
} from 'src/models/character/active-spell-slots';
import { CharacterStatusSchema } from 'src/models/character/character-status.model';
import { TitleType } from 'src/models/enums/title-type.enum';

const SLOTS_BY_XP_AND_TITLE: Array<
    [number, TitleType | null | undefined, number]
> = [
    [40000, TitleType.rookie, 0],
    [40000, TitleType.adventurer, 0],
    [40000, TitleType.paladin, 0],
    [19999, TitleType.mage, 0],
    [20000, TitleType.mage, 1],
    [25000, TitleType.mage, 2],
    [30000, TitleType.hero, 3],
    [40000, TitleType.legend, 4],
    [50000, TitleType.mage, 4],
    [40000, null, 0],
    [40000, undefined, 0],
];

describe('active spell slots', () => {
    it.each(SLOTS_BY_XP_AND_TITLE)(
        'maxActiveSpellsFor(%i, %s) is %i',
        (xp, title, slots) => {
            expect(maxActiveSpellsFor(xp, title)).toBe(slots);
        },
    );

    it.each(SLOTS_BY_XP_AND_TITLE)(
        'the maxActiveSpells virtual answers %i xp as %s with %i slots',
        (xp, title, slots) => {
            const StatusProbe =
                mongoose.models.CharacterStatusSlotsProbe ??
                mongoose.model(
                    'CharacterStatusSlotsProbe',
                    CharacterStatusSchema,
                );

            expect(new StatusProbe({ xp, title }).get('maxActiveSpells')).toBe(
                slots,
            );
        },
    );

    it('opens spell slots from the mage rank up', () => {
        expect(SPELL_CASTER_TITLES).toEqual(['mage', 'hero', 'legend']);
    });

    it('gates the $switch of the same thresholds on the live title', () => {
        const xp = { $ifNull: ['$status.xp', 0] };

        expect(maxActiveSpellsExpression()).toEqual({
            $cond: [
                {
                    $in: [
                        { $ifNull: ['$status.title', null] },
                        ['mage', 'hero', 'legend'],
                    ],
                },
                {
                    $switch: {
                        branches: [
                            { case: { $gte: [xp, 40000] }, then: 4 },
                            { case: { $gte: [xp, 30000] }, then: 3 },
                            { case: { $gte: [xp, 25000] }, then: 2 },
                            { case: { $gte: [xp, 20000] }, then: 1 },
                        ],
                        default: 0,
                    },
                },
                0,
            ],
        });
    });
});
