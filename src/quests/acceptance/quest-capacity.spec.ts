import { TitleType } from 'src/models/enums/title-type.enum';
import {
    RankSlot,
    RegisteredAdventurer,
    hasSeatFor,
    isFullForEveryone,
    seatAvailableExpr,
    slotRuleOf,
    slotsOf,
} from 'src/quests/acceptance/quest-capacity';

const TITLES = ['rookie', 'adventurer', 'paladin', 'mage', 'hero', 'legend'];

function COUNT(title: string) {
    return {
        $size: {
            $filter: {
                input: { $ifNull: ['$registeredAdventurers', []] },
                as: 'adventurer',
                cond: { $eq: ['$$adventurer.title', title] },
            },
        },
    };
}

function registered(...titles: string[]): RegisteredAdventurer[] {
    return titles.map((title, index) => ({
        character: `character-${index}`,
        title: title as TitleType,
    }));
}

function ruleOf(...slots: RankSlot[]) {
    return slotRuleOf(slots);
}

const hero = (count: number): RankSlot => ({ title: TitleType.hero, count });
const paladin = (count: number): RankSlot => ({
    title: TitleType.paladin,
    count,
});
const anyRank = (count: number): RankSlot => ({ title: null, count });

describe('quest capacity (D-32)', () => {
    describe('slotsOf', () => {
        it.each([undefined, null, 0, 1, 'hero', {}, []])(
            'rejects %p as invalid',
            (value) => {
                expect(slotsOf(value)).toBe('invalid');
            },
        );

        it('keeps a ranked slot', () => {
            expect(slotsOf([{ title: 'hero', count: 1 }])).toEqual([
                { title: 'hero', count: 1 },
            ]);
        });

        it('turns a slot without title into a wildcard', () => {
            expect(slotsOf([{ count: 2 }])).toEqual([
                { title: null, count: 2 },
            ]);
        });

        it('normalizes a mixed list', () => {
            expect(
                slotsOf([
                    { title: null, count: 1 },
                    { title: 'paladin', count: 4 },
                ]),
            ).toEqual([
                { title: null, count: 1 },
                { title: 'paladin', count: 4 },
            ]);
        });

        it.each([
            [[{ title: 'king', count: 1 }]],
            [[{ title: 'hero', count: 0 }]],
            [[{ title: 'hero', count: 1.5 }]],
            [[{ title: 'hero' }]],
            [[null]],
            [[{ title: 'hero', count: -1 }]],
            [[{ title: 'hero', count: Number.MAX_SAFE_INTEGER + 1 }]],
        ])('rejects %p: one invalid slot invalidates the list', (value) => {
            expect(slotsOf(value)).toBe('invalid');
            expect(slotsOf([{ title: null, count: 1 }, ...value])).toBe(
                'invalid',
            );
        });
    });

    describe('slotRuleOf', () => {
        it('splits ranked seats and wildcards', () => {
            expect(ruleOf(hero(1), anyRank(2))).toEqual({
                seats: { hero: 1 },
                wildcard: 2,
                total: 3,
            });
        });

        it('sums the slots of the same rank', () => {
            expect(ruleOf(hero(1), hero(2), anyRank(1))).toEqual({
                seats: { hero: 3 },
                wildcard: 1,
                total: 4,
            });
        });

        it('keeps a wildcard-only rule', () => {
            expect(ruleOf(anyRank(1))).toEqual({
                seats: {},
                wildcard: 1,
                total: 1,
            });
        });
    });

    describe('hasSeatFor', () => {
        it('applies the canonical case shared with the FE: [hero 1, null 2] with [paladin, mage] rejects a third paladin and admits a hero', () => {
            const rule = ruleOf(hero(1), anyRank(2));
            const roster = registered('paladin', 'mage');

            expect(hasSeatFor(rule, roster, TitleType.paladin)).toBe(false);
            expect(hasSeatFor(rule, roster, TitleType.hero)).toBe(true);
            expect(hasSeatFor(rule, roster, TitleType.mage)).toBe(false);
        });

        it.each([
            [[], 'hero', true],
            [['hero'], 'hero', true],
            [['hero', 'hero'], 'hero', false],
            [['hero'], 'paladin', true],
            [['hero', 'hero'], 'paladin', false],
        ])(
            '[hero 1, null 1] with %p admits %s: %s',
            (roster, title, expected) => {
                expect(
                    hasSeatFor(
                        ruleOf(hero(1), anyRank(1)),
                        registered(...roster),
                        title as TitleType,
                    ),
                ).toBe(expected);
            },
        );

        it.each([
            [[], 'rookie', true],
            [['rookie'], 'rookie', false],
            [['rookie'], 'legend', false],
        ])('[null 1] with %p admits %s: %s', (roster, title, expected) => {
            expect(
                hasSeatFor(
                    ruleOf(anyRank(1)),
                    registered(...roster),
                    title as TitleType,
                ),
            ).toBe(expected);
        });

        it('fills the ranked seats of a world mission without wildcards', () => {
            const rule = ruleOf(hero(5), paladin(4));
            const fiveHeroes = registered(
                'hero',
                'hero',
                'hero',
                'hero',
                'hero',
            );

            expect(hasSeatFor(rule, fiveHeroes, TitleType.hero)).toBe(false);
            expect(hasSeatFor(rule, fiveHeroes, TitleType.paladin)).toBe(true);
            expect(hasSeatFor(rule, [], TitleType.rookie)).toBe(false);
        });

        it('ignores registered adventurers with an unknown title', () => {
            const rule = ruleOf(anyRank(1));

            expect(hasSeatFor(rule, registered('king'), TitleType.rookie)).toBe(
                true,
            );
        });
    });

    describe('isFullForEveryone', () => {
        const rule = () => ruleOf(hero(1), anyRank(2));

        it('is full when every seat is taken', () => {
            expect(
                isFullForEveryone(
                    rule(),
                    registered('hero', 'paladin', 'mage'),
                ),
            ).toBe(true);
        });

        it('is not full while a seat is left', () => {
            expect(
                isFullForEveryone(rule(), registered('paladin', 'mage')),
            ).toBe(false);
        });

        it('does not count unknown titles', () => {
            expect(
                isFullForEveryone(
                    rule(),
                    registered('paladin', 'mage', 'king'),
                ),
            ).toBe(false);
        });
    });

    describe('seatAvailableExpr', () => {
        it('checks only the own rank when there is no wildcard', () => {
            expect(
                seatAvailableExpr(
                    { seats: { hero: 1 }, wildcard: 0, total: 1 },
                    TitleType.paladin,
                ),
            ).toEqual({ $lt: [COUNT('paladin'), 0] });
        });

        it('mirrors hasSeatFor with the overflow over the wildcards', () => {
            expect(
                seatAvailableExpr(
                    { seats: { hero: 1 }, wildcard: 2, total: 3 },
                    TitleType.hero,
                ),
            ).toEqual({
                $or: [
                    { $lt: [COUNT('hero'), 1] },
                    {
                        $lt: [
                            {
                                $add: TITLES.map((u) => ({
                                    $max: [
                                        0,
                                        {
                                            $subtract: [
                                                COUNT(u),
                                                u === 'hero' ? 1 : 0,
                                            ],
                                        },
                                    ],
                                })),
                            },
                            2,
                        ],
                    },
                ],
            });
        });
    });
});
