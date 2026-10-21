import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    capacityRuleOf,
    CharacterEligibilitySnapshot,
    classifyEligibility,
    hasCapacity,
    isRepeatable,
    isShared,
    meetsTitle,
    pointsCostOf,
    QuestEligibilitySnapshot,
    Registration,
    TITLE_RANK,
    waitingTimeOf,
} from './quest-eligibility';
import { laneOf, QuestLane } from './quest-lanes';

describe('quest eligibility rules', () => {
    it('ranks the titles from rookie to legend', () => {
        expect(TITLE_RANK).toEqual({
            rookie: 0,
            adventurer: 1,
            paladin: 2,
            mage: 3,
            hero: 4,
            legend: 5,
        });
    });

    describe('meetsTitle', () => {
        it.each([
            [QuestType.story, TitleType.rookie, TitleType.rookie, true],
            [QuestType.story, TitleType.adventurer, TitleType.rookie, false],
            [QuestType.story, TitleType.rookie, TitleType.adventurer, false],
            [QuestType.story, TitleType.legend, TitleType.legend, true],
            [QuestType.hunt, TitleType.hero, TitleType.paladin, true],
            [QuestType.hunt, TitleType.paladin, TitleType.paladin, true],
            [QuestType.hunt, TitleType.rookie, TitleType.paladin, false],
            [QuestType.worldMission, TitleType.mage, TitleType.hero, false],
            [QuestType.boss, TitleType.legend, TitleType.hero, true],
            [QuestType.hunt, TitleType.rookie, undefined, true],
            [QuestType.story, TitleType.hero, null, true],
            [QuestType.hunt, 'king' as TitleType, TitleType.rookie, false],
        ])(
            '%s with title %s and minTitle %s is %s',
            (type, title, minTitle, expected) => {
                expect(meetsTitle(type, title, minTitle)).toBe(expected);
            },
        );
    });

    const repeatable: Record<QuestType, boolean> = {
        [QuestType.hunt]: true,
        [QuestType.dungeon]: true,
        [QuestType.heal]: true,
        [QuestType.job]: true,
        [QuestType.study]: true,
        [QuestType.crime]: true,
        [QuestType.guard]: true,
        [QuestType.story]: false,
        [QuestType.worldMission]: false,
        [QuestType.enemy]: false,
        [QuestType.boss]: false,
        [QuestType.aid]: false,
    };

    it('the repeatability table covers every QuestType', () => {
        expect(Object.keys(repeatable).sort()).toEqual(
            Object.values(QuestType).sort(),
        );
    });

    it.each(Object.entries(repeatable))(
        'isRepeatable(%s) is %s',
        (type, expected) => {
            expect(isRepeatable(type as QuestType)).toBe(expected);
        },
    );

    it.each(Object.values(QuestType))('isShared(%s)', (type) => {
        expect(isShared(type)).toBe(
            type === QuestType.worldMission || type === QuestType.boss,
        );
    });

    describe('pointsCostOf', () => {
        it.each([
            [QuestLane.story, 5000, 5000],
            [QuestLane.worldMission, 1, 1],
            [QuestLane.worldMission, 2147483647, 2147483647],
        ])('%s costs %s points', (lane, requiredPoints, cost) => {
            expect(pointsCostOf(lane, requiredPoints)).toEqual({ cost });
        });

        const invalidPoints = [
            null,
            undefined,
            0,
            -1,
            1.5,
            2 ** 53,
            2147483648,
            Number.NaN,
        ];

        it.each(invalidPoints)(
            'story with requiredPoints %s is invalid',
            (requiredPoints) => {
                expect(pointsCostOf(QuestLane.story, requiredPoints)).toBe(
                    'invalid',
                );
            },
        );

        it.each(invalidPoints)(
            'worldMission with requiredPoints %s is invalid',
            (requiredPoints) => {
                expect(
                    pointsCostOf(QuestLane.worldMission, requiredPoints),
                ).toBe('invalid');
            },
        );

        it.each([3000, null])(
            'the standard lane is free (%s)',
            (requiredPoints) => {
                expect(
                    pointsCostOf(QuestLane.standard, requiredPoints),
                ).toEqual({
                    cost: 0,
                });
            },
        );
    });

    describe('waitingTimeOf', () => {
        it.each([
            [QuestLane.standard, 60000, 60000],
            [QuestLane.standard, null, 0],
            [QuestLane.standard, undefined, 0],
            [QuestLane.story, 60000, 0],
            [QuestLane.worldMission, 60000, 0],
        ])(
            '%s with timeToComplete %s waits %s',
            (lane, timeToComplete, expected) => {
                expect(waitingTimeOf(lane, timeToComplete)).toBe(expected);
            },
        );
    });

    describe('capacityRuleOf', () => {
        const party = [
            { title: TitleType.hero, count: 1 },
            { title: TitleType.paladin, count: 1 },
        ];

        it('uses the exact slot of the rank', () => {
            expect(capacityRuleOf({ party }, TitleType.hero)).toEqual({
                kind: 'perRank',
                title: 'hero',
                limit: 1,
            });
        });

        it('gives zero seats to a rank missing from the party', () => {
            expect(capacityRuleOf({ party }, TitleType.mage)).toEqual({
                kind: 'perRank',
                title: 'mage',
                limit: 0,
            });
        });

        it('falls back to requiredAdventurers with an empty or missing party', () => {
            expect(
                capacityRuleOf(
                    { party: [], requiredAdventurers: 2 },
                    TitleType.hero,
                ),
            ).toEqual({ kind: 'total', limit: 2 });
            expect(
                capacityRuleOf({ requiredAdventurers: 2 }, TitleType.hero),
            ).toEqual({ kind: 'total', limit: 2 });
        });

        it('is unlimited without party and without requiredAdventurers', () => {
            expect(
                capacityRuleOf(
                    { party: [], requiredAdventurers: 0 },
                    TitleType.hero,
                ),
            ).toEqual({ kind: 'unlimited' });
            expect(capacityRuleOf(null, TitleType.hero)).toEqual({
                kind: 'unlimited',
            });
            expect(capacityRuleOf(undefined, TitleType.hero)).toEqual({
                kind: 'unlimited',
            });
        });
    });

    describe('hasCapacity', () => {
        const registered = (title: TitleType) => ({
            character: new Types.ObjectId(),
            title,
        });
        const rosterOf = (...registrations: Registration[]) => ({
            registrations,
        });
        const legacyIds = (count: number) =>
            Array.from({ length: count }, () =>
                new Types.ObjectId().toHexString(),
            );

        it('an unlimited quest always has room', () => {
            const many = Array.from({ length: 99 }, () =>
                registered(TitleType.hero),
            );

            expect(hasCapacity({ kind: 'unlimited' }, rosterOf(...many))).toBe(
                true,
            );
        });

        it('counts only the registrations of the same rank', () => {
            const rule = {
                kind: 'perRank',
                title: TitleType.hero,
                limit: 1,
            } as const;

            expect(
                hasCapacity(rule, rosterOf(registered(TitleType.hero))),
            ).toBe(false);
            expect(
                hasCapacity(rule, rosterOf(registered(TitleType.paladin))),
            ).toBe(true);
        });

        it('a rank with zero seats is always full', () => {
            expect(
                hasCapacity(
                    { kind: 'perRank', title: TitleType.mage, limit: 0 },
                    rosterOf(),
                ),
            ).toBe(false);
        });

        it('counts every registration for a total limit', () => {
            const rule = { kind: 'total', limit: 2 } as const;

            expect(
                hasCapacity(
                    rule,
                    rosterOf(
                        registered(TitleType.hero),
                        registered(TitleType.paladin),
                    ),
                ),
            ).toBe(false);
            expect(
                hasCapacity(rule, rosterOf(registered(TitleType.hero))),
            ).toBe(true);
        });

        it('counts the legacy adventurers for a total limit', () => {
            const rule = { kind: 'total', limit: 2 } as const;

            expect(
                hasCapacity(rule, {
                    registrations: [],
                    registeredAdventurers: legacyIds(2),
                }),
            ).toBe(false);
            expect(
                hasCapacity(rule, {
                    registrations: [registered(TitleType.hero)],
                    registeredAdventurers: legacyIds(1),
                }),
            ).toBe(true);
        });

        it('ignores the legacy adventurers for a per-rank limit (no title)', () => {
            expect(
                hasCapacity(
                    { kind: 'perRank', title: TitleType.hero, limit: 1 },
                    { registrations: [], registeredAdventurers: legacyIds(3) },
                ),
            ).toBe(true);
        });

        it('treats missing registrations as none', () => {
            const rule = { kind: 'total', limit: 1 } as const;

            expect(
                hasCapacity(rule, {
                    registrations: null,
                    registeredAdventurers: null,
                }),
            ).toBe(true);
            expect(hasCapacity(rule, {})).toBe(true);
        });
    });

    describe('classifyEligibility', () => {
        const questId = new Types.ObjectId();
        const characterId = new Types.ObjectId();

        function questOf(
            type: QuestType,
            overrides: Partial<QuestEligibilitySnapshot> = {},
        ): QuestEligibilitySnapshot {
            return {
                _id: questId,
                infos: { type },
                requirements: { minTitle: TitleType.rookie, party: [] },
                registrations: [],
                registeredAdventurers: [],
                ...overrides,
            };
        }

        function characterOf(
            title: TitleType = TitleType.rookie,
            quests: Partial<
                NonNullable<CharacterEligibilitySnapshot['quests']>
            > = {},
        ): CharacterEligibilitySnapshot {
            return {
                _id: characterId,
                status: { title },
                quests: {
                    completedQuests: [],
                    pendingQuest: null,
                    activeStoryQuest: null,
                    activeWorldMissionQuest: null,
                    ...quests,
                },
            };
        }

        function classify(
            quest: QuestEligibilitySnapshot,
            character: CharacterEligibilitySnapshot,
        ) {
            return classifyEligibility(
                quest,
                character,
                laneOf(quest.infos.type),
            );
        }

        const heroParty = {
            minTitle: TitleType.rookie,
            party: [{ title: TitleType.hero, count: 1 }],
        };
        const otherHero = {
            character: new Types.ObjectId(),
            title: TitleType.hero,
        };

        it('rejects a completed story (ObjectId form)', () => {
            expect(
                classify(
                    questOf(QuestType.story),
                    characterOf(TitleType.rookie, {
                        completedQuests: [questId],
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('rejects a completed story saved as a hex string (legacy)', () => {
            expect(
                classify(
                    questOf(QuestType.story),
                    characterOf(TitleType.rookie, {
                        completedQuests: [questId.toHexString()],
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('checks repeatability before the title', () => {
            expect(
                classify(
                    questOf(QuestType.story),
                    characterOf(TitleType.hero, {
                        completedQuests: [questId],
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('rejects a world mission the character already joined, even with the lane busy', () => {
            const busy = { activeWorldMissionQuest: new Types.ObjectId() };

            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        registeredAdventurers: [characterId.toHexString()],
                    }),
                    characterOf(TitleType.rookie, busy),
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        registrations: [
                            { character: characterId, title: TitleType.rookie },
                        ],
                    }),
                    characterOf(TitleType.rookie, busy),
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('accepts a repeatable quest already completed', () => {
            expect(
                classify(
                    questOf(QuestType.hunt),
                    characterOf(TitleType.rookie, {
                        completedQuests: [questId],
                    }),
                ),
            ).toBeNull();
        });

        it('checks the title before the lane', () => {
            expect(
                classify(
                    questOf(QuestType.story, {
                        requirements: { minTitle: TitleType.hero },
                    }),
                    characterOf(TitleType.rookie, {
                        activeStoryQuest: new Types.ObjectId(),
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_TITLE_MISMATCH' });
        });

        it('checks the lane before the capacity', () => {
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        requirements: heroParty,
                        registrations: [otherHero],
                    }),
                    characterOf(TitleType.hero, {
                        activeWorldMissionQuest: new Types.ObjectId(),
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_SLOT_BUSY' });
            expect(
                classify(
                    questOf(QuestType.story),
                    characterOf(TitleType.rookie, {
                        activeStoryQuest: new Types.ObjectId(),
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_SLOT_BUSY' });
        });

        it('lets a story run in parallel with a standard quest', () => {
            expect(
                classify(
                    questOf(QuestType.story),
                    characterOf(TitleType.rookie, {
                        pendingQuest: new Types.ObjectId(),
                    }),
                ),
            ).toBeNull();
        });

        it('rejects a world mission whose rank is full or missing', () => {
            const quest = questOf(QuestType.worldMission, {
                requirements: heroParty,
                registrations: [otherHero],
            });

            expect(classify(quest, characterOf(TitleType.hero))).toMatchObject({
                code: 'QUEST_FULL',
            });
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        requirements: heroParty,
                    }),
                    characterOf(TitleType.paladin),
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
        });

        it('rejects a boss whose rank is full', () => {
            expect(
                classify(
                    questOf(QuestType.boss, {
                        requirements: heroParty,
                        registrations: [otherHero],
                    }),
                    characterOf(TitleType.hero),
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
        });

        it('rejects a legacy world mission whose total is taken by legacy adventurers', () => {
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        requirements: {
                            minTitle: TitleType.rookie,
                            party: [],
                            requiredAdventurers: 1,
                        },
                        registrations: [],
                        registeredAdventurers: [
                            new Types.ObjectId().toHexString(),
                        ],
                    }),
                    characterOf(TitleType.rookie),
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
        });

        it('never applies a capacity to a story', () => {
            expect(
                classify(
                    questOf(QuestType.story, {
                        requirements: {
                            minTitle: TitleType.rookie,
                            requiredAdventurers: 1,
                        },
                        registrations: [otherHero],
                    }),
                    characterOf(TitleType.rookie),
                ),
            ).toBeNull();
        });

        it('accepts when everything is free', () => {
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        requirements: heroParty,
                    }),
                    characterOf(TitleType.hero),
                ),
            ).toBeNull();
        });
    });
});
