import type { FixKind } from 'src/content/schema/fix.content';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';

export type FixMode = 'dry-run' | 'apply' | 'verify';

// pending = c'è qualcosa da fare (dry-run/verify), applied = scritto ora, done = niente da fare, blocked = non si può fare senza rischio
export type FixStatus = 'pending' | 'applied' | 'done' | 'blocked';

export type BlockedLane = QuestLane | 'awaitingAid';

export interface BlockedQuest {
    questId: string;
    pendingQuest: string | null;
    character: string;
    lane: BlockedLane;
}

// touched = documenti che cambierebbero (pending) o che sono cambiati (applied)
export interface FixReport {
    key: string;
    kind: FixKind;
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
