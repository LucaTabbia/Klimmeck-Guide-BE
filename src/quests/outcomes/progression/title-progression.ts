import { TitleType } from 'src/models/enums/title-type.enum';

export const TITLE_ORDER: readonly TitleType[] = [];

export function nextTitleAfterStory(
    current: TitleType,
    _storyTitle: TitleType | null | undefined,
): TitleType {
    return current;
}
