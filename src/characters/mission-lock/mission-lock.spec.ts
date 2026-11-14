import {
    guidedMissionInProgressOf,
    LockLanes,
    missionInProgressOf,
} from 'src/characters/mission-lock/mission-lock';

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
