import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    CharacterEligibilitySnapshot,
    classifyEligibility,
    isRegistered,
    isRepeatable,
    meetsTitle,
    pointsCostOf,
    QuestEligibilitySnapshot,
    registrationRuleOf,
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

    it.each([
        QuestType.worldMission,
        QuestType.boss,
        QuestType.enemy,
        QuestType.aid,
    ])('isRegistered(%s) is true', (type) => {
        expect(isRegistered(type)).toBe(true);
    });

    it.each([
        QuestType.hunt,
        QuestType.dungeon,
        QuestType.job,
        QuestType.heal,
        QuestType.study,
        QuestType.story,
        QuestType.crime,
        QuestType.guard,
    ])('isRegistered(%s) is false', (type) => {
        expect(isRegistered(type)).toBe(false);
    });

    describe('registrationRuleOf', () => {
        it('has no rule for a quest without registration', () => {
            expect(
                registrationRuleOf(QuestType.hunt, {
                    requiredAdventurers: 'qualsiasi',
                }),
            ).toBeNull();
        });

        it('builds the slot rule of a registered quest', () => {
            expect(
                registrationRuleOf(QuestType.enemy, {
                    requiredAdventurers: [{ title: null, count: 1 }],
                }),
            ).toEqual({ seats: {}, wildcard: 1, total: 1 });
        });

        it.each([[{ requiredAdventurers: [] }], [{ requiredAdventurers: 1 }]])(
            'an enemy with %p is invalid',
            (requirements) => {
                expect(registrationRuleOf(QuestType.enemy, requirements)).toBe(
                    'invalid',
                );
            },
        );

        it('a registered quest without requirements is invalid', () => {
            expect(registrationRuleOf(QuestType.enemy, null)).toBe('invalid');
            expect(registrationRuleOf(QuestType.aid, {})).toBe('invalid');
        });
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
                requirements: { minTitle: TitleType.rookie },
                registeredAdventurers: [],
                ...overrides,
            };
        }

        function characterOf(
            title: TitleType = TitleType.rookie,
            quests: Partial<
                NonNullable<CharacterEligibilitySnapshot['quests']>
            > = {},
            activeTravel: unknown = null,
        ): CharacterEligibilitySnapshot {
            return {
                _id: characterId,
                status: { title, activeTravel },
                quests: {
                    completedQuests: [],
                    pendingQuest: null,
                    activeStoryQuest: null,
                    activeWorldMissionQuest: null,
                    ...quests,
                },
            };
        }

        function ruleOf(quest: QuestEligibilitySnapshot) {
            const rule = registrationRuleOf(
                quest.infos.type,
                quest.requirements,
            );
            if (rule === 'invalid') throw new Error('invalid slots in test');
            return rule;
        }

        function classify(
            quest: QuestEligibilitySnapshot,
            character: CharacterEligibilitySnapshot,
        ) {
            return classifyEligibility(
                quest,
                character,
                laneOf(quest.infos.type),
                ruleOf(quest),
            );
        }

        const heroSlot = {
            minTitle: TitleType.rookie,
            requiredAdventurers: [{ title: TitleType.hero, count: 1 }],
        };
        const otherHero = {
            character: new Types.ObjectId(),
            title: TitleType.hero,
        };
        const travelling = { endTime: new Date('2026-10-21T12:00:00Z') };

        it('rejects a travelling character before every other rule', () => {
            const completedBusy = characterOf(
                TitleType.rookie,
                {
                    completedQuests: [questId],
                    activeStoryQuest: new Types.ObjectId(),
                },
                travelling,
            );

            expect(
                classify(questOf(QuestType.story), completedBusy),
            ).toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
            expect(
                classify(
                    questOf(QuestType.story, {
                        requirements: { minTitle: TitleType.hero },
                    }),
                    characterOf(TitleType.rookie, {}, travelling),
                ),
            ).toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
            expect(
                classify(
                    questOf(QuestType.hunt),
                    characterOf(
                        TitleType.rookie,
                        { pendingQuest: new Types.ObjectId() },
                        travelling,
                    ),
                ),
            ).toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
        });

        it('applies the following rules when the character is not travelling', () => {
            const absent: CharacterEligibilitySnapshot = {
                _id: characterId,
                status: { title: TitleType.rookie },
                quests: { activeStoryQuest: new Types.ObjectId() },
            };

            expect(classify(questOf(QuestType.hunt), characterOf())).toBeNull();
            expect(classify(questOf(QuestType.story), absent)).toMatchObject({
                code: 'QUEST_SLOT_BUSY',
            });
        });

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
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        requirements: heroSlot,
                        registeredAdventurers: [
                            { character: characterId, title: TitleType.hero },
                        ],
                    }),
                    characterOf(TitleType.hero, {
                        activeWorldMissionQuest: new Types.ObjectId(),
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('rejects an enemy the character already joined', () => {
            expect(
                classify(
                    questOf(QuestType.enemy, {
                        requirements: {
                            requiredAdventurers: [{ title: null, count: 3 }],
                        },
                        registeredAdventurers: [
                            {
                                character: characterId.toHexString(),
                                title: TitleType.hero,
                            },
                        ],
                    }),
                    characterOf(TitleType.hero),
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
                        requirements: heroSlot,
                        registeredAdventurers: [otherHero],
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

        it('rejects a world mission without a seat for the rank', () => {
            expect(
                classify(
                    questOf(QuestType.worldMission, {
                        requirements: heroSlot,
                        registeredAdventurers: [otherHero],
                    }),
                    characterOf(TitleType.hero),
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
            expect(
                classify(
                    questOf(QuestType.worldMission, { requirements: heroSlot }),
                    characterOf(TitleType.paladin),
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
        });

        it.each([QuestType.boss, QuestType.enemy, QuestType.aid])(
            'rejects a full %s',
            (type) => {
                expect(
                    classify(
                        questOf(type, {
                            requirements: {
                                requiredAdventurers: [
                                    { title: null, count: 1 },
                                ],
                            },
                            registeredAdventurers: [otherHero],
                        }),
                        characterOf(TitleType.hero),
                    ),
                ).toMatchObject({ code: 'QUEST_FULL' });
            },
        );

        it('applies the canonical case shared with the FE (D-32)', () => {
            const quest = questOf(QuestType.worldMission, {
                requirements: {
                    requiredAdventurers: [
                        { title: TitleType.hero, count: 1 },
                        { title: null, count: 2 },
                    ],
                },
                registeredAdventurers: [
                    {
                        character: new Types.ObjectId(),
                        title: TitleType.paladin,
                    },
                    { character: new Types.ObjectId(), title: TitleType.mage },
                ],
            });

            expect(
                classify(quest, characterOf(TitleType.paladin)),
            ).toMatchObject({ code: 'QUEST_FULL' });
            expect(classify(quest, characterOf(TitleType.hero))).toBeNull();
        });

        it('never applies a capacity without a rule', () => {
            const quest = questOf(QuestType.hunt, {
                requirements: {
                    minTitle: TitleType.rookie,
                    requiredAdventurers: 1,
                },
                registeredAdventurers: [otherHero],
            });

            expect(
                classifyEligibility(
                    quest,
                    characterOf(TitleType.rookie),
                    QuestLane.standard,
                    null,
                ),
            ).toBeNull();
        });

        it('accepts when everything is free', () => {
            expect(
                classify(
                    questOf(QuestType.worldMission, { requirements: heroSlot }),
                    characterOf(TitleType.hero),
                ),
            ).toBeNull();
        });
    });
});
