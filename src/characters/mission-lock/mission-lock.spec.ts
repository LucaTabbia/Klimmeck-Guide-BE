import mongoose, { Model, Types } from 'mongoose';
import {
    guidedMissionInProgressOf,
    LockLanes,
    lockLanesOf,
    missionInProgressOf,
} from 'src/characters/mission-lock/mission-lock';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { buildCharacter } from '../../../test/fixtures';

const STARTED = new Date('2026-11-14T10:00:00.000Z');

describe('mission lock predicate', () => {
    it('locks a standard lane whose mission has started (D-12)', () => {
        const lanes: LockLanes = { pendingQuest: { startDate: STARTED } };

        expect(missionInProgressOf(lanes)).toBe(true);
        expect(guidedMissionInProgressOf(lanes)).toBe(false);
    });

    it('leaves free a standard lane still travelling or waiting for the party (D-12)', () => {
        const lanes: LockLanes = { pendingQuest: { startDate: null } };

        expect(missionInProgressOf(lanes)).toBe(false);
        expect(guidedMissionInProgressOf(lanes)).toBe(false);
    });

    it('ignores the start date of the GM lanes written at acceptance (D-12, D-18)', () => {
        const lanes: LockLanes = {
            activeStoryQuest: {
                startDate: STARTED,
                missionDraftStartedAt: null,
            },
        };

        expect(missionInProgressOf(lanes)).toBe(false);
        expect(guidedMissionInProgressOf(lanes)).toBe(false);
    });

    it.each(['activeStoryQuest', 'activeWorldMissionQuest'] as const)(
        'locks a story or world mission lane with an open guided draft (D-11, D-16): %s',
        (lane) => {
            const lanes: LockLanes = {
                [lane]: { startDate: null, missionDraftStartedAt: STARTED },
            };

            expect(missionInProgressOf(lanes)).toBe(true);
            expect(guidedMissionInProgressOf(lanes)).toBe(true);
        },
    );

    it.each([{}, null, undefined])(
        'does not lock a wounded character awaiting aid with free lanes (D-23): %p',
        (lanes) => {
            expect(missionInProgressOf(lanes)).toBe(false);
            expect(guidedMissionInProgressOf(lanes)).toBe(false);
        },
    );

    it('treats an absent marker as no draft (D-18)', () => {
        const lanes: LockLanes = {
            activeStoryQuest: {},
            activeWorldMissionQuest: {},
        };

        expect(missionInProgressOf(lanes)).toBe(false);
        expect(guidedMissionInProgressOf(lanes)).toBe(false);
    });
});

describe('lanes of a character', () => {
    // nessuna connessione: new Model lavora in memoria e un documento assegnato a un ref resta popolato
    const CharacterModel: Model<any> =
        mongoose.models[Character.name] ||
        mongoose.model(Character.name, CharacterSchema);
    const PendingQuestModel: Model<any> =
        mongoose.models[PendingQuest.name] ||
        mongoose.model(PendingQuest.name, PendingQuestSchema);

    it('reads populated lanes without a second read (D-16)', () => {
        const standard = new PendingQuestModel({
            startDate: STARTED,
            waitingTime: 0,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
        });
        const worldMission = new PendingQuestModel({
            startDate: null,
            missionDraftStartedAt: STARTED,
            waitingTime: 0,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
        });
        const character = new CharacterModel({
            ...buildCharacter(),
            quests: {
                completedQuests: [],
                pendingQuest: standard,
                activeStoryQuest: null,
                activeWorldMissionQuest: worldMission,
            },
        });

        expect(lockLanesOf(character)).toEqual({
            pendingQuest: { startDate: STARTED, missionDraftStartedAt: null },
            activeStoryQuest: null,
            activeWorldMissionQuest: {
                startDate: null,
                missionDraftStartedAt: STARTED,
            },
        });
    });

    it('leaves free a wounded character awaiting aid, whose lane the outcome emptied (D-23)', () => {
        const wounded = new CharacterModel({
            ...buildCharacter(),
            status: {
                ...buildCharacter().status,
                awaitingAid: {
                    quest: new Types.ObjectId(),
                    aidQuest: new Types.ObjectId(),
                    since: STARTED,
                },
            },
            quests: {
                completedQuests: [],
                pendingQuest: null,
                activeStoryQuest: null,
                activeWorldMissionQuest: null,
            },
        });

        const lanes = lockLanesOf(wounded);

        expect(lanes).toEqual({
            pendingQuest: null,
            activeStoryQuest: null,
            activeWorldMissionQuest: null,
        });
        expect(missionInProgressOf(lanes as LockLanes)).toBe(false);
        expect(guidedMissionInProgressOf(lanes as LockLanes)).toBe(false);
    });

    it('reads plain populated lanes too (D-16)', () => {
        expect(
            lockLanesOf({
                quests: {
                    pendingQuest: { startDate: STARTED },
                    activeStoryQuest: null,
                },
            }),
        ).toEqual({
            pendingQuest: { startDate: STARTED, missionDraftStartedAt: null },
            activeStoryQuest: null,
            activeWorldMissionQuest: null,
        });
    });

    it.each([
        ['an ObjectId', new Types.ObjectId()],
        ['a hex string', new Types.ObjectId().toHexString()],
    ])('asks the reader when a lane is only an id (D-16): %s', (_, id) => {
        expect(
            lockLanesOf({
                quests: {
                    pendingQuest: { startDate: STARTED },
                    activeWorldMissionQuest: id,
                },
            }),
        ).toBe('unresolved');
    });

    it.each([null, undefined])(
        'answers no lanes without a character (D-16): %p',
        (character) => {
            expect(lockLanesOf(character)).toBeNull();
        },
    );

    it.each([{}, { quests: null }])(
        'asks the reader for a character read without its lanes (D-16): %p',
        (character) => {
            expect(lockLanesOf(character)).toBe('unresolved');
        },
    );
});
