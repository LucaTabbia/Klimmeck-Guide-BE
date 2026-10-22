import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    ClaimedQuest,
    classifyUnclaimed,
    classifyUnregistered,
    LaneClaimSnapshot,
    laneClaimFilter,
    laneClaimUpdate,
    registrationFilter,
    registrationUpdate,
    UnclaimedSnapshot,
} from './quest-acceptance.updates';
import { seatAvailableExpr, slotRuleOf } from './quest-capacity';
import { QuestLane } from './quest-lanes';

describe('quest acceptance write builders', () => {
    const c = new Types.ObjectId();
    const q = new Types.ObjectId();
    const p = new Types.ObjectId();
    const loc = new Types.ObjectId();

    const expected: LaneClaimSnapshot = {
        title: TitleType.rookie,
        location: loc,
    };

    describe('laneClaimFilter', () => {
        it('reasserts lane, travel, title and location on the active character for the standard lane', () => {
            const filter = laneClaimFilter(
                c,
                QuestLane.standard,
                expected,
                q,
                true,
            );

            expect(filter).toEqual({
                _id: c,
                deletedAt: null,
                'quests.pendingQuest': null,
                'status.activeTravel': null,
                'status.title': 'rookie',
                'status.location': { $in: [loc, loc.toHexString()] },
            });
            expect(filter._id).toBeInstanceOf(Types.ObjectId);
        });

        it('has no location only for the story lane and keeps the completed guard', () => {
            const filter = laneClaimFilter(
                c,
                QuestLane.story,
                { title: TitleType.rookie },
                q,
                false,
            );

            expect(filter).toEqual({
                _id: c,
                deletedAt: null,
                'quests.activeStoryQuest': null,
                'status.activeTravel': null,
                'status.title': 'rookie',
                'quests.completedQuests': { $nin: [q, q.toHexString()] },
            });
            expect(filter).not.toHaveProperty(['status.location']);
        });

        it('reasserts the location for the world mission lane', () => {
            expect(
                laneClaimFilter(c, QuestLane.worldMission, expected, q, true),
            ).toEqual({
                _id: c,
                deletedAt: null,
                'quests.activeWorldMissionQuest': null,
                'status.activeTravel': null,
                'status.title': 'rookie',
                'status.location': { $in: [loc, loc.toHexString()] },
            });
        });
    });

    describe('laneClaimUpdate', () => {
        it('sets the lane to the new pending quest', () => {
            expect(laneClaimUpdate(QuestLane.worldMission, p)).toEqual({
                $set: { 'quests.activeWorldMissionQuest': p },
            });
        });

        it('sets only the standard lane without a movement', () => {
            expect(laneClaimUpdate(QuestLane.standard, p)).toEqual({
                $set: { 'quests.pendingQuest': p },
            });
            expect(laneClaimUpdate(QuestLane.standard, p, null)).toEqual({
                $set: { 'quests.pendingQuest': p },
            });
        });

        it('writes the travel to the marker in the same update as the claim (D-21)', () => {
            const travel = {
                road: {
                    coordinates: [
                        [0, 0],
                        [0.1, 0],
                    ] as [number, number][],
                    distance: 11.1,
                },
                startTime: new Date('2026-03-04T05:06:07.000Z'),
                endTime: new Date('2026-03-04T06:06:07.000Z'),
                duration: 3_600_000,
                to: loc,
                kind: TravelKind.quest,
            };

            expect(
                laneClaimUpdate(QuestLane.standard, p, {
                    kind: 'travel',
                    travel,
                }),
            ).toEqual({
                $set: {
                    'quests.pendingQuest': p,
                    'status.activeTravel': travel,
                },
            });
        });

        it('moves the character onto the marker in the same update as the claim (D-03)', () => {
            expect(
                laneClaimUpdate(QuestLane.standard, p, {
                    kind: 'jump',
                    marker: loc,
                }),
            ).toEqual({
                $set: {
                    'quests.pendingQuest': p,
                    'status.location': loc,
                },
            });
        });
    });

    describe('registrationFilter', () => {
        it('guards duplicates and the live seats in the same filter', () => {
            const rule = slotRuleOf([
                { title: TitleType.hero, count: 1 },
                { title: null, count: 2 },
            ]);

            expect(registrationFilter(q, c, rule, TitleType.hero)).toEqual({
                _id: q,
                'registeredAdventurers.character': { $ne: c },
                $expr: seatAvailableExpr(rule, TitleType.hero),
            });
        });
    });

    it('registrationUpdate records the character with its title', () => {
        expect(registrationUpdate(c, TitleType.hero)).toEqual({
            $push: { registeredAdventurers: { character: c, title: 'hero' } },
        });
    });

    describe('classifyUnclaimed', () => {
        function freshOf(
            overrides: Partial<UnclaimedSnapshot> = {},
        ): UnclaimedSnapshot {
            return {
                status: { title: TitleType.rookie, location: loc },
                quests: {
                    completedQuests: [],
                    pendingQuest: null,
                    activeStoryQuest: null,
                    activeWorldMissionQuest: null,
                },
                ...overrides,
            };
        }

        const story: ClaimedQuest = {
            id: q,
            type: QuestType.story,
            minTitle: TitleType.rookie,
        };

        const classify = (
            fresh: UnclaimedSnapshot | null,
            quest: ClaimedQuest = story,
        ) => classifyUnclaimed(fresh, quest, expected);

        it('a missing character is NOT_FOUND', () => {
            expect(classify(null)).toMatchObject({
                code: 'NOT_FOUND',
                message: 'Personaggio non trovato',
            });
        });

        it('a travelling character is TRAVEL_IN_PROGRESS before a busy lane', () => {
            expect(
                classify(
                    freshOf({
                        status: {
                            title: TitleType.rookie,
                            activeTravel: { endTime: new Date() },
                        },
                        quests: { activeStoryQuest: new Types.ObjectId() },
                    }),
                ),
            ).toMatchObject({ code: 'TRAVEL_IN_PROGRESS' });
        });

        it('a busy lane is QUEST_SLOT_BUSY', () => {
            expect(
                classify(
                    freshOf({
                        quests: { activeStoryQuest: new Types.ObjectId() },
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_SLOT_BUSY' });
        });

        it('a completed non repeatable quest is QUEST_ALREADY_TAKEN', () => {
            expect(
                classify(freshOf({ quests: { completedQuests: [q] } })),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('a changed title is QUEST_TITLE_MISMATCH', () => {
            expect(
                classify(
                    freshOf({
                        status: { title: TitleType.adventurer, location: loc },
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_TITLE_MISMATCH' });
        });

        it('a title raised to one the quest still admits is not QUEST_TITLE_MISMATCH', () => {
            const hunt: ClaimedQuest = {
                id: q,
                type: QuestType.hunt,
                minTitle: TitleType.rookie,
            };

            expect(
                classify(
                    freshOf({
                        status: { title: TitleType.adventurer, location: loc },
                    }),
                    hunt,
                ),
            ).toMatchObject({ code: 'QUEST_SLOT_BUSY' });
        });

        it('a title that no longer meets minTitle is QUEST_TITLE_MISMATCH', () => {
            const hunt: ClaimedQuest = {
                id: q,
                type: QuestType.hunt,
                minTitle: TitleType.paladin,
            };

            expect(
                classify(
                    freshOf({
                        status: { title: TitleType.adventurer, location: loc },
                    }),
                    hunt,
                ),
            ).toMatchObject({ code: 'QUEST_TITLE_MISMATCH' });
        });

        it('a changed location is QUEST_NOT_IN_CITY for the standard lane', () => {
            const hunt: ClaimedQuest = {
                id: q,
                type: QuestType.hunt,
                minTitle: TitleType.rookie,
            };

            expect(
                classify(
                    freshOf({
                        status: {
                            title: TitleType.rookie,
                            location: new Types.ObjectId(),
                        },
                    }),
                    hunt,
                ),
            ).toMatchObject({ code: 'QUEST_NOT_IN_CITY' });
        });

        it('a changed location is QUEST_NOT_IN_CITY for the world mission lane', () => {
            const worldMission: ClaimedQuest = {
                id: q,
                type: QuestType.worldMission,
                minTitle: TitleType.rookie,
            };

            expect(
                classify(
                    freshOf({
                        status: {
                            title: TitleType.rookie,
                            location: new Types.ObjectId(),
                        },
                    }),
                    worldMission,
                ),
            ).toMatchObject({ code: 'QUEST_NOT_IN_CITY' });
        });

        it('a changed location without an expected one falls back to QUEST_SLOT_BUSY', () => {
            expect(
                classifyUnclaimed(
                    freshOf({
                        status: {
                            title: TitleType.rookie,
                            location: new Types.ObjectId(),
                        },
                    }),
                    story,
                    { title: TitleType.rookie },
                ),
            ).toMatchObject({ code: 'QUEST_SLOT_BUSY' });
        });

        it('the same location saved as a string is still in the city', () => {
            expect(
                classify(
                    freshOf({
                        status: {
                            title: TitleType.rookie,
                            location: loc.toHexString(),
                        },
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_SLOT_BUSY' });
        });

        it('falls back to QUEST_SLOT_BUSY without a recognizable difference', () => {
            expect(classify(freshOf())).toMatchObject({
                code: 'QUEST_SLOT_BUSY',
            });
        });
    });

    describe('classifyUnregistered', () => {
        it('a missing quest is NOT_FOUND', () => {
            expect(classifyUnregistered(null, c)).toMatchObject({
                code: 'NOT_FOUND',
                message: 'Missione non trovata',
            });
        });

        it('a registered character is QUEST_ALREADY_TAKEN', () => {
            expect(
                classifyUnregistered(
                    {
                        registeredAdventurers: [
                            { character: c, title: TitleType.hero },
                        ],
                    },
                    c,
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('otherwise there is no seat', () => {
            expect(
                classifyUnregistered(
                    {
                        registeredAdventurers: [
                            {
                                character: new Types.ObjectId(),
                                title: TitleType.hero,
                            },
                        ],
                    },
                    c,
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
            expect(classifyUnregistered({}, c)).toMatchObject({
                code: 'QUEST_FULL',
            });
        });
    });
});
