import { TitleType } from 'src/models/enums/title-type.enum';
import {
    TITLE_ORDER,
    nextTitleAfterStory,
} from 'src/quests/outcomes/progression/title-progression';

describe('TITLE_ORDER', () => {
    it('lists the titles from rookie to legend', () => {
        expect(TITLE_ORDER).toEqual([
            'rookie',
            'adventurer',
            'paladin',
            'mage',
            'hero',
            'legend',
        ]);
    });
});

describe('nextTitleAfterStory', () => {
    it.each([
        [TitleType.rookie, TitleType.rookie, TitleType.adventurer],
        [TitleType.mage, TitleType.mage, TitleType.hero],
        [TitleType.hero, TitleType.hero, TitleType.legend],
        [TitleType.legend, TitleType.legend, TitleType.legend],
    ])(
        'advances %s after the story of the exact title %s to %s',
        (current, storyTitle, expected) => {
            expect(nextTitleAfterStory(current, storyTitle)).toBe(expected);
        },
    );

    it.each([
        [TitleType.paladin, TitleType.rookie],
        [TitleType.rookie, null],
        [TitleType.rookie, undefined],
    ])('keeps %s after a story of title %s', (current, storyTitle) => {
        expect(nextTitleAfterStory(current, storyTitle)).toBe(current);
    });
});
