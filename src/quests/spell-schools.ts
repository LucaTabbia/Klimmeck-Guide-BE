// le tre quest di scuola e l'origine che insegnano (Phase 24 D-09, D-10, D-20): una tabella, tre consumatori (ripetibilità, pool dello studio, sorteggio)
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
