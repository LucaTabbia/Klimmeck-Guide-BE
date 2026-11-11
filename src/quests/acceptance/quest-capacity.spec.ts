import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    RankSlot,
    RegisteredAdventurer,
    hasSeatFor,
    isFullForEveryone,
    questSlotsOf,
    seatAvailableExpr,
    slotRuleOf,
    slotsOf,
    soloSlots,
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
const legend = (count: number): RankSlot => ({
    title: TitleType.legend,
    count,
});
const seat = (title: TitleType, count: number): RankSlot => ({
    title,
    count,
});

function FOLDED_LEGEND(legendSeats: number) {
    return { $min: [COUNT('legend'), legendSeats] };
}

// 13.1 D-08: con posti hero i legend oltre i posti legend contano sui posti hero
function FOLDED_COUNT(title: string) {
    if (title === 'hero') return FOLDED_HERO(0);
    if (title === 'legend') return FOLDED_LEGEND(0);
    return COUNT(title);
}

function FOLDED_HERO(legendSeats: number) {
    return {
        $add: [
            COUNT('hero'),
            { $max: [0, { $subtract: [COUNT('legend'), legendSeats] }] },
        ],
    };
}

describe('quest capacity (D-32)', () => {
    describe('questSlotsOf (quick 261111-enm)', () => {
        const ONE_FREE_SEAT = [{ title: null, count: 1 }];

        it('gives a solo quest one seat without a title', () => {
            expect(soloSlots()).toEqual(ONE_FREE_SEAT);
            expect(soloSlots()).not.toBe(soloSlots());
        });

        it.each([
            ['the rank-exact seat written before the rule', [hero(1)]],
            ['a seat without a title', [{ title: null, count: 1 }]],
            ['more than one seat', [paladin(3)]],
            ['mixed seats', [hero(1), { title: null, count: 2 }]],
        ])('reads an enemy with %s as one rank-free seat', (_label, value) => {
            expect(questSlotsOf(QuestType.enemy, value)).toEqual(ONE_FREE_SEAT);
        });

        it.each([undefined, null, 1, [], [{ title: 'king', count: 1 }]])(
            'keeps an enemy with the seats %p invalid (D-27)',
            (value) => {
                expect(questSlotsOf(QuestType.enemy, value)).toBe('invalid');
            },
        );

        it.each([QuestType.boss, QuestType.worldMission, QuestType.aid])(
            'keeps the seats of a %s as written',
            (type) => {
                expect(
                    questSlotsOf(type, [hero(2), { title: null, count: 1 }]),
                ).toEqual([hero(2), { title: null, count: 1 }]);
                expect(questSlotsOf(type, [])).toBe('invalid');
            },
        );
    });

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
                    { $lt: [FOLDED_HERO(0), 1] },
                    {
                        $lt: [
                            {
                                $add: TITLES.map((u) => ({
                                    $max: [
                                        0,
                                        {
                                            $subtract: [
                                                FOLDED_COUNT(u),
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

    describe('legend on hero seats (13.1 D-08)', () => {
        it('lets a legend take a hero seat (D-08)', () => {
            expect(hasSeatFor(ruleOf(hero(1)), [], TitleType.legend)).toBe(
                true,
            );
            expect(
                hasSeatFor(
                    ruleOf(hero(2)),
                    registered('legend'),
                    TitleType.hero,
                ),
            ).toBe(true);
            expect(
                hasSeatFor(
                    ruleOf(hero(1)),
                    registered('legend'),
                    TitleType.hero,
                ),
            ).toBe(false);
            expect(
                hasSeatFor(
                    ruleOf(hero(1)),
                    registered('hero'),
                    TitleType.legend,
                ),
            ).toBe(false);
            expect(
                isFullForEveryone(ruleOf(hero(1)), registered('legend')),
            ).toBe(true);
        });

        it('fills the legend seats before the hero seats (D-08)', () => {
            const rule = ruleOf(legend(1), hero(1));

            expect(
                hasSeatFor(rule, registered('legend'), TitleType.legend),
            ).toBe(true);
            expect(hasSeatFor(rule, registered('legend'), TitleType.hero)).toBe(
                true,
            );
            expect(
                hasSeatFor(
                    rule,
                    registered('legend', 'legend'),
                    TitleType.hero,
                ),
            ).toBe(false);
            expect(
                hasSeatFor(
                    rule,
                    registered('legend', 'legend'),
                    TitleType.legend,
                ),
            ).toBe(false);
        });

        it('counts a legend on a hero seat before the wildcards (D-08)', () => {
            const rule = ruleOf(hero(1), anyRank(1));

            expect(
                hasSeatFor(rule, registered('legend'), TitleType.paladin),
            ).toBe(true);
            expect(
                hasSeatFor(
                    rule,
                    registered('legend', 'legend'),
                    TitleType.paladin,
                ),
            ).toBe(false);
        });

        it('scales no other title (D-08)', () => {
            const admitted: string[] = [];
            for (const title of Object.values(TitleType)) {
                for (const rank of Object.values(TitleType)) {
                    if (rank === title) continue;
                    if (title === TitleType.legend && rank === TitleType.hero) {
                        continue;
                    }
                    if (hasSeatFor(ruleOf(seat(rank, 1)), [], title)) {
                        admitted.push(`${title} on ${rank}`);
                    }
                }
            }

            expect(admitted).toEqual([]);
        });

        it('mirrors the legend on hero seats in the registration filter (D-08)', () => {
            expect(
                seatAvailableExpr(ruleOf(hero(1)), TitleType.legend),
            ).toEqual({
                $cond: [
                    { $lt: [COUNT('legend'), 0] },
                    { $lt: [FOLDED_LEGEND(0), 0] },
                    { $lt: [FOLDED_HERO(0), 1] },
                ],
            });
            expect(
                seatAvailableExpr(
                    ruleOf(paladin(1), anyRank(1)),
                    TitleType.legend,
                ),
            ).toEqual({
                $or: [
                    { $lt: [COUNT('legend'), 0] },
                    {
                        $lt: [
                            {
                                $add: TITLES.map((u) => ({
                                    $max: [
                                        0,
                                        {
                                            $subtract: [
                                                COUNT(u),
                                                u === 'paladin' ? 1 : 0,
                                            ],
                                        },
                                    ],
                                })),
                            },
                            1,
                        ],
                    },
                ],
            });
        });
    });
});
