import { TitleType } from 'src/models/enums/title-type.enum';
import { TITLE_RANK } from 'src/quests/acceptance/quest-eligibility';

// ordine dei titoli dalla stessa fonte dell'accettazione (D-06 Phase 7): nessuna seconda tabella
export const TITLE_ORDER: readonly TitleType[] = (
    Object.keys(TITLE_RANK) as TitleType[]
).sort((a, b) => TITLE_RANK[a] - TITLE_RANK[b]);

// avanza solo con la story del titolo esatto (D-14); legend resta legend; nessun avanzamento per XP
export function nextTitleAfterStory(
    current: TitleType,
    storyTitle: TitleType | null | undefined,
): TitleType {
    if (!storyTitle || current !== storyTitle) return current;
    return TITLE_ORDER[TITLE_ORDER.indexOf(current) + 1] ?? current;
}
