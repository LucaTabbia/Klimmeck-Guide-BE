import { Types } from 'mongoose';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    classifyUnclaimed,
    classifyUnregistered,
    LaneClaimSnapshot,
    laneClaimFilter,
    laneClaimUpdate,
    registrationFilter,
    registrationUpdate,
    takenCountExpr,
    UnclaimedSnapshot,
} from './quest-acceptance.updates';
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
        it('reasserts lane, title, location and non repeatability on the active character', () => {
            const filter = laneClaimFilter(
                c,
                QuestLane.story,
                expected,
                q,
                false,
            );

            expect(filter).toEqual({
                _id: c,
                deletedAt: null,
                'quests.activeStoryQuest': null,
                'status.title': 'rookie',
                'status.location': { $in: [loc, loc.toHexString()] },
                'quests.completedQuests': { $nin: [q, q.toHexString()] },
            });
            expect(filter._id).toBeInstanceOf(Types.ObjectId);
        });

        it('drops the completed guard for a repeatable quest', () => {
            expect(
                laneClaimFilter(c, QuestLane.standard, expected, q, true),
            ).toEqual({
                _id: c,
                deletedAt: null,
                'quests.pendingQuest': null,
                'status.title': 'rookie',
                'status.location': { $in: [loc, loc.toHexString()] },
            });
        });
    });

    it('laneClaimUpdate sets the lane to the new pending quest', () => {
        expect(laneClaimUpdate(QuestLane.worldMission, p)).toEqual({
            $set: { 'quests.activeWorldMissionQuest': p },
        });
    });

    describe('takenCountExpr', () => {
        it('counts the registrations of the rank', () => {
            expect(
                takenCountExpr({
                    kind: 'perRank',
                    title: TitleType.hero,
                    limit: 2,
                }),
            ).toEqual({
                $size: {
                    $filter: {
                        input: { $ifNull: ['$registrations', []] },
                        as: 'registration',
                        cond: { $eq: ['$$registration.title', 'hero'] },
                    },
                },
            });
        });

        it('counts every registration for a total limit', () => {
            expect(takenCountExpr({ kind: 'total', limit: 2 })).toEqual({
                $size: { $ifNull: ['$registrations', []] },
            });
        });
    });

    describe('registrationFilter', () => {
        it('guards duplicates and live capacity in the same filter', () => {
            const rule = {
                kind: 'perRank',
                title: TitleType.hero,
                limit: 2,
            } as const;

            expect(registrationFilter(q, c, rule)).toEqual({
                _id: q,
                'registrations.character': { $ne: c },
                registeredAdventurers: { $ne: c.toHexString() },
                $expr: { $lt: [takenCountExpr(rule), 2] },
            });
        });

        it('has no capacity guard for an unlimited quest', () => {
            expect(registrationFilter(q, c, { kind: 'unlimited' })).toEqual({
                _id: q,
                'registrations.character': { $ne: c },
                registeredAdventurers: { $ne: c.toHexString() },
            });
        });
    });

    it('registrationUpdate records the character with its title', () => {
        expect(registrationUpdate(c, TitleType.paladin)).toEqual({
            $push: { registrations: { character: c, title: 'paladin' } },
            $addToSet: { registeredAdventurers: c.toHexString() },
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

        const classify = (fresh: UnclaimedSnapshot | null) =>
            classifyUnclaimed(fresh, QuestLane.story, expected, q, false);

        it('a missing character is NOT_FOUND', () => {
            expect(classify(null)).toMatchObject({
                code: 'NOT_FOUND',
                message: 'Personaggio non trovato',
            });
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

        it('a changed location is QUEST_NOT_IN_CITY', () => {
            expect(
                classify(
                    freshOf({
                        status: {
                            title: TitleType.rookie,
                            location: new Types.ObjectId(),
                        },
                    }),
                ),
            ).toMatchObject({ code: 'QUEST_NOT_IN_CITY' });
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
                        registrations: [
                            { character: c, title: TitleType.hero },
                        ],
                    },
                    c,
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
            expect(
                classifyUnregistered(
                    { registeredAdventurers: [c.toHexString()] },
                    c,
                ),
            ).toMatchObject({ code: 'QUEST_ALREADY_TAKEN' });
        });

        it('otherwise the rank is full', () => {
            expect(
                classifyUnregistered(
                    {
                        registrations: [
                            {
                                character: new Types.ObjectId(),
                                title: TitleType.hero,
                            },
                        ],
                        registeredAdventurers: [],
                    },
                    c,
                ),
            ).toMatchObject({ code: 'QUEST_FULL' });
        });
    });
});
