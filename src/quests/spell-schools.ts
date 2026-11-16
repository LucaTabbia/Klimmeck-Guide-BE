// le tre quest di scuola e l'origine che insegnano (Phase 24 D-09, D-10, D-20): la leggono il pool di lore dello studio e il sorteggio; la ripetibilità elenca i tre tipi a mano in REPEATABLE_TYPES
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SpellOrigin } from 'src/models/enums/spell-origin.enum';

export const SPELL_ORIGIN_BY_QUEST_TYPE: Readonly<
    Partial<Record<QuestType, SpellOrigin>>
> = {
    [QuestType.arcane]: SpellOrigin.arcane,
    [QuestType.shamanic]: SpellOrigin.shamanic,
    [QuestType.void]: SpellOrigin.void,
};

export function schoolOriginOf(type: unknown): SpellOrigin | null {
    if (typeof type !== 'string') return null;
    if (!Object.hasOwn(SPELL_ORIGIN_BY_QUEST_TYPE, type)) return null;
    return SPELL_ORIGIN_BY_QUEST_TYPE[type as QuestType] ?? null;
}

export function isSpellSchool(type: unknown): boolean {
    return schoolOriginOf(type) !== null;
}

// regola dell'utente (UAT 2026-11-16): nelle quest di scuola le nozioni si scoprono più di rado che nello studio
export const SPELL_SCHOOL_LORE_STUDY_CHANCE = 0.15;

export function loreStudyChanceOf(type: unknown, studyChance: number): number {
    return isSpellSchool(type) ? SPELL_SCHOOL_LORE_STUDY_CHANCE : studyChance;
}
