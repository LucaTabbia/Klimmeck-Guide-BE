import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    isSpellSchool,
    loreStudyChanceOf,
    schoolOriginOf,
    SPELL_ORIGIN_BY_QUEST_TYPE,
    SPELL_SCHOOL_LORE_STUDY_CHANCE,
} from './spell-schools';

const SCHOOL_TYPES = [QuestType.arcane, QuestType.shamanic, QuestType.void];

describe('spell schools', () => {
    it('maps each school quest type to the origin it teaches, pair by pair (D-10, D-20)', () => {
        expect(SPELL_ORIGIN_BY_QUEST_TYPE).toEqual({
            arcane: 'arcane',
            shamanic: 'shamanic',
            void: 'void',
        });
    });

    it('names the three school types and no magic type (D-20)', () => {
        const types: string[] = Object.values(QuestType);

        expect(types).toEqual(
            expect.arrayContaining(['arcane', 'shamanic', 'void']),
        );
        expect(types).not.toContain('magic');
    });

    it.each([
        ...Object.values(QuestType).filter(
            (type) => !SCHOOL_TYPES.includes(type),
        ),
        'magic',
        'toString',
        '',
        undefined,
        null,
        7,
    ])('answers no origin outside the three schools (D-09): %p', (type) => {
        expect(schoolOriginOf(type)).toBeNull();
        expect(isSpellSchool(type)).toBe(false);
    });

    it.each(SCHOOL_TYPES)('recognises the three schools (D-09): %s', (type) => {
        expect(isSpellSchool(type)).toBe(true);
    });

    it.each(SCHOOL_TYPES)(
        'draws a study lore less often in a school quest than in a study: %s',
        (type) => {
            expect(SPELL_SCHOOL_LORE_STUDY_CHANCE).toBe(0.15);
            expect(loreStudyChanceOf(type, 0.5)).toBe(0.15);
        },
    );

    it.each([QuestType.study, 'magic', undefined])(
        'keeps the configured study chance outside the three schools: %p',
        (type) => {
            expect(loreStudyChanceOf(type, 0.5)).toBe(0.5);
            expect(loreStudyChanceOf(type, 0.2)).toBe(0.2);
        },
    );
});
