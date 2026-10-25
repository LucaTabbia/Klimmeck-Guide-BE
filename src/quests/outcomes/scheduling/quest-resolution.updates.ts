import { PipelineStage, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { isRegistered } from 'src/quests/acceptance/quest-eligibility';
import { laneOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import { AID_TIMEOUT_MS } from 'src/quests/outcomes/aid/aid-timeout';

export interface DueStandardQuest {
    _id: Types.ObjectId;
    pendingQuestId: Types.ObjectId;
    startDate: Date;
    waitingTime: number;
}

// party = tipi registrati della corsia standard (gli stessi che QuestStartService avvia come party): un tipo nuovo entra da solo nello sweep
export const PARTY_TYPES: readonly QuestType[] = Object.values(
    QuestType,
).filter((type) => isRegistered(type) && laneOf(type) === QuestLane.standard);

const STANDARD_LANE_LOOKUP: PipelineStage[] = [
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
];

// solo la corsia standard dei personaggi attivi (Pitfall 2): le PendingQuest GM hanno waitingTime 0 e risulterebbero scadute; now dal Clock, mai la variabile NOW del server Mongo
export function dueStandardQuestsPipeline(now: Date): PipelineStage[] {
    return [
        ...STANDARD_LANE_LOOKUP,
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

export interface ArrivedUnstartedQuest {
    questId: unknown;
    pendingQuestId: Types.ObjectId;
    // assente se la quest non esiste più o il ref è legacy (stringa)
    type?: QuestType | null;
}

export interface FormingParty {
    _id: Types.ObjectId;
    registeredAdventurers?: { registeredAt?: Date | null }[] | null;
}

// arrivati sul marker ma non avviati (utente 2026-10-25): l'avvio mancato dopo un crash lo recupera lo sweep; il tipo decide il dedupe del party
export function arrivedUnstartedPipeline(): PipelineStage[] {
    return [
        ...STANDARD_LANE_LOOKUP,
        { $match: { 'pq.startDate': null, 'pq.arrivedAt': { $ne: null } } },
        {
            $lookup: {
                from: 'quests',
                localField: 'pq.quest',
                foreignField: '_id',
                as: 'quest',
            },
        },
        {
            $project: {
                _id: 0,
                questId: '$pq.quest',
                pendingQuestId: '$pq._id',
                type: { $arrayElemAt: ['$quest.infos.type', 0] },
            },
        },
    ];
}

// party in formazione: quest registrate aperte, non avviate, con almeno un registrato (finestra delle 24 ore)
export function formingPartiesFilter(): Record<string, unknown> {
    return {
        'infos.type': { $in: PARTY_TYPES },
        concludedAt: null,
        startedAt: null,
        'registeredAdventurers.0': { $exists: true },
    };
}

export const FORMING_PARTY_PROJECTION = { registeredAdventurers: 1 } as const;

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
