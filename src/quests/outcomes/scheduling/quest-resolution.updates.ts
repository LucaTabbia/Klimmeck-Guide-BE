import { PipelineStage, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import { AID_TIMEOUT_MS } from 'src/quests/outcomes/aid/aid-timeout';

export interface DueStandardQuest {
    _id: Types.ObjectId;
    pendingQuestId: Types.ObjectId;
    startDate: Date;
    waitingTime: number;
}

// solo la corsia standard dei personaggi attivi (Pitfall 2): le PendingQuest GM hanno waitingTime 0 e risulterebbero scadute; now dal Clock, mai la variabile NOW del server Mongo
export function dueStandardQuestsPipeline(now: Date): PipelineStage[] {
    return [
        {
            $match: {
                ...ACTIVE_CHARACTER_FILTER,
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
                    $lte: [{ $add: ['$pq.startDate', '$pq.waitingTime'] }, now],
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
    ];
}

// il timeout di 7 giorni parte da status.awaitingAid.since (D-10)
export function dueAidTimeoutsFilter(now: Date): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        'status.awaitingAid.since': {
            $lte: new Date(now.getTime() - AID_TIMEOUT_MS),
        },
    };
}

export const DUE_AID_TIMEOUT_PROJECTION = { 'status.awaitingAid': 1 } as const;
