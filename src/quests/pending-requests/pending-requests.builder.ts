import type { Types } from 'mongoose';
import type { ActiveTravel } from 'src/models/character/active-travel.model';
import type { AwaitingAid } from 'src/models/character/awaiting-aid.model';
import type { PendingRequest } from 'src/models/pending-request.model';
import type { QuestRegistration } from 'src/models/quest/quest-registration.model';

export interface RequestCharacterSnapshot {
    _id: Types.ObjectId;
    infos?: { name?: string };
    status?: {
        title?: string;
        location?: unknown;
        activeTravel?: ActiveTravel | null;
        awaitingAid?: AwaitingAid | null;
    };
    quests?: { activeStoryQuest?: unknown; activeWorldMissionQuest?: unknown };
}

export interface RequestPendingQuestSnapshot {
    _id: Types.ObjectId;
    startDate?: Date | null;
    pointsSpent?: number;
    quest?: unknown;
}

export interface RequestQuestSnapshot {
    _id: Types.ObjectId;
    infos?: { type?: string; title?: string };
    requirements?: { requiredAdventurers?: unknown };
    registeredAdventurers?: QuestRegistration[];
}

export interface RequestUserSnapshot {
    _id: Types.ObjectId;
    twitchId: string;
    currentCharacter?: unknown;
}

export interface PendingRequestsInput {
    characters: RequestCharacterSnapshot[];
    pendingQuests: RequestPendingQuestSnapshot[];
    quests: RequestQuestSnapshot[];
    users: RequestUserSnapshot[];
}

export interface SkippedRequest {
    characterId: string;
    pendingQuestId: string;
}

export interface PendingRequestsBuild {
    requests: PendingRequest[];
    skipped: SkippedRequest[];
}

export function buildPendingRequests(
    input: PendingRequestsInput,
): PendingRequestsBuild {
    void input;
    return { requests: [], skipped: [] };
}
