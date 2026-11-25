import { Types } from 'mongoose';
import {
    concludedQuestCleanupOf,
    EMPTY_MISSION_DRAFT_FILTER,
    erasedCharacterIdsOf,
    laneRequestIdsOf,
    missionDraftCleanupOf,
    rescuedCountKeeperOf,
} from 'src/account/deletion/account-erasure.plan';

const FIRST = new Types.ObjectId('64b0000000000000000000c1');
const SECOND = new Types.ObjectId('64b0000000000000000000c2');
const CURRENT = new Types.ObjectId('64b0000000000000000000c3');
const STANDARD = new Types.ObjectId('64b0000000000000000000d1');
const STORY = new Types.ObjectId('64b0000000000000000000d2');
const WORLD = new Types.ObjectId('64b0000000000000000000d3');
const ANONYMOUS = new Types.ObjectId('64b0000000000000000000e1');

describe('account erasure plan', () => {
    describe('erasedCharacterIdsOf', () => {
        it('joins the owned characters and the current one without duplicates (D-24)', () => {
            expect(
                erasedCharacterIdsOf(FIRST, [{ _id: FIRST }, { _id: SECOND }]),
            ).toEqual([FIRST, SECOND]);
            expect(
                erasedCharacterIdsOf(CURRENT.toHexString(), [
                    { _id: FIRST },
                    { _id: SECOND },
                ]),
            ).toEqual([FIRST, SECOND, CURRENT]);
            expect(erasedCharacterIdsOf(CURRENT, [])).toEqual([CURRENT]);
            expect(erasedCharacterIdsOf(null, [{ _id: SECOND }])).toEqual([
                SECOND,
            ]);
            expect(erasedCharacterIdsOf(undefined, [])).toEqual([]);
        });
    });

    describe('laneRequestIdsOf', () => {
        it('collects the requests of every lane of every character (D-14)', () => {
            expect(
                laneRequestIdsOf([
                    {
                        quests: {
                            pendingQuest: STANDARD,
                            activeStoryQuest: STORY.toHexString(),
                            activeWorldMissionQuest: null,
                        },
                    },
                    {
                        quests: {
                            pendingQuest: 'not-an-id',
                            activeWorldMissionQuest: WORLD,
                        },
                    },
                    { quests: null },
                    {},
                ]),
            ).toEqual([STANDARD, STORY, WORLD]);
        });
    });

    describe('missionDraftCleanupOf', () => {
        it('pulls the characters out of guided drafts and bumps the revision (D-14)', () => {
            const ids = { $in: [FIRST, SECOND] };

            expect(missionDraftCleanupOf([FIRST, SECOND])).toEqual({
                filter: {
                    $or: [
                        { 'participants.character': ids },
                        { 'prizes.character': ids },
                        { 'backgroundAdditions.character': ids },
                        { 'fights.outcomes.character': ids },
                    ],
                },
                update: {
                    $pull: {
                        participants: { character: ids },
                        prizes: { character: ids },
                        backgroundAdditions: { character: ids },
                        'fights.$[].outcomes': { character: ids },
                    },
                    $inc: { rev: 1 },
                },
            });
        });

        it('finds the drafts left without participants (D-14)', () => {
            expect(EMPTY_MISSION_DRAFT_FILTER).toEqual({
                participants: { $size: 0 },
            });
        });
    });

    describe('rescuedCountKeeperOf', () => {
        it('keeps the rescue count of other players without the deleted ids (D-14)', () => {
            const forms = {
                $in: [FIRST, FIRST.toHexString(), SECOND, SECOND.toHexString()],
            };

            expect(rescuedCountKeeperOf([FIRST, SECOND], ANONYMOUS)).toEqual({
                filter: { rescuedCharacters: forms },
                update: { $set: { 'rescuedCharacters.$[erased]': ANONYMOUS } },
                arrayFilters: [{ erased: forms }],
            });
        });
    });

    describe('concludedQuestCleanupOf', () => {
        it('cleans the concluded quests and aids of the deleted characters (D-14)', () => {
            const forms = {
                $in: [FIRST, FIRST.toHexString(), SECOND, SECOND.toHexString()],
            };

            expect(concludedQuestCleanupOf([FIRST, SECOND])).toEqual({
                seats: {
                    filter: {
                        concludedAt: { $ne: null },
                        'registeredAdventurers.character': forms,
                    },
                    update: {
                        $pull: { registeredAdventurers: { character: forms } },
                    },
                },
                wounded: {
                    filter: {
                        concludedAt: { $ne: null },
                        'rescue.characters': forms,
                    },
                    update: { $pull: { 'rescue.characters': forms } },
                },
            });
        });
    });
});
