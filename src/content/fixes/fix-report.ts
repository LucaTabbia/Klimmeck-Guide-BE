export type FixMode = 'dry-run' | 'apply' | 'verify';

// pending = c'è qualcosa da fare (dry-run/verify), applied = scritto ora, done = niente da fare, blocked = non si può fare senza rischio
export type FixStatus = 'pending' | 'applied' | 'done' | 'blocked';

export type QuestLane =
    | 'pendingQuest'
    | 'activeStoryQuest'
    | 'activeWorldMissionQuest'
    | 'awaitingAid';

export interface BlockedQuest {
    questId: string;
    pendingQuest: string | null;
    character: string;
    lane: QuestLane;
}

// touched = documenti che cambierebbero (pending) o che sono cambiati (applied)
export interface FixReport {
    key: string;
    kind: string;
    status: FixStatus;
    touched: number;
    blocked?: BlockedQuest[];
    deleted?: string[];
    pendingQuestsDeleted?: number;
    poiBackLinksCleared?: number;
    questResultsKept?: number;
    aidReferences?: string[];
    foundName?: string;
    unknownTypes?: string[];
}

export function changeStatus(touched: number, mode: FixMode): FixStatus {
    if (touched === 0) return 'done';
    return mode === 'apply' ? 'applied' : 'pending';
}
