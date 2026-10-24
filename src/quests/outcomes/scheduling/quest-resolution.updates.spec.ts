import {
    DUE_AID_TIMEOUT_PROJECTION,
    dueAidTimeoutsFilter,
    dueStandardQuestsPipeline,
} from './quest-resolution.updates';

describe('quest resolution updates', () => {
    const NOW = new Date('2026-10-24T12:00:00.000Z');

    describe('dueStandardQuestsPipeline', () => {
        it('selects the started standard quests of active characters past their deadline', () => {
            expect(dueStandardQuestsPipeline(NOW)).toEqual([
                {
                    $match: {
                        deletedAt: null,
                        'quests.pendingQuest': { $ne: null },
                    },
                },
                {
                    $lookup: {
                        from: 'pendingquests',
                        localField: 'quests.pendingQuest',
                        foreignField: '_id',
                        as: 'pq',
                    },
                },
                { $unwind: '$pq' },
                {
                    $match: {
                        'pq.startDate': { $ne: null },
                        $expr: {
                            $lte: [
                                { $add: ['$pq.startDate', '$pq.waitingTime'] },
                                NOW,
                            ],
                        },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        pendingQuestId: '$pq._id',
                        startDate: '$pq.startDate',
                        waitingTime: '$pq.waitingTime',
                    },
                },
            ]);
        });

        it('takes now from the clock, never from $$NOW', () => {
            expect(
                JSON.stringify(dueStandardQuestsPipeline(NOW)),
            ).not.toContain('$$NOW');
        });
    });

    describe('dueAidTimeoutsFilter', () => {
        it('selects the active characters awaiting aid for 7 days or more', () => {
            expect(dueAidTimeoutsFilter(NOW)).toEqual({
                deletedAt: null,
                'status.awaitingAid.since': {
                    $lte: new Date(NOW.getTime() - 604_800_000),
                },
            });
        });

        it('projects only the awaiting aid', () => {
            expect(DUE_AID_TIMEOUT_PROJECTION).toEqual({
                'status.awaitingAid': 1,
            });
        });
    });
});
