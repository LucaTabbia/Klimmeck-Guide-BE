import { Types } from 'mongoose';
import { QUEST_LANES } from 'src/quests/acceptance/quest-lanes';

export interface LockLane {
    startDate?: Date | null;
    missionDraftStartedAt?: Date | null;
}

export interface LockLanes {
    pendingQuest?: LockLane | null;
    activeStoryQuest?: LockLane | null;
    activeWorldMissionQuest?: LockLane | null;
}

// la startDate delle corsie GM è scritta all'accettazione e non conta: solo il marcatore della bozza (D-12, D-18)
export function guidedMissionInProgressOf(
    lanes: LockLanes | null | undefined,
): boolean {
    return (
        lanes?.activeStoryQuest?.missionDraftStartedAt != null ||
        lanes?.activeWorldMissionQuest?.missionDraftStartedAt != null
    );
}

// una sola regola per ogni guardia (D-12, D-13): corsia standard avviata o bozza guidata aperta
export function missionInProgressOf(
    lanes: LockLanes | null | undefined,
): boolean {
    return (
        lanes?.pendingQuest?.startDate != null ||
        guidedMissionInProgressOf(lanes)
    );
}

export type LaneResolution = LockLanes | 'unresolved' | null;

interface FieldReader {
    get?: (path: string) => unknown;
}

const isLaneId = (lane: unknown): boolean =>
    lane instanceof Types.ObjectId || typeof lane === 'string';

// un documento idratato espone i campi come getter del prototipo: solo `in` e `.get`, mai l'elenco delle chiavi (ruling I3)
const isPopulatedLane = (lane: unknown): lane is object =>
    typeof lane === 'object' &&
    lane !== null &&
    !(lane instanceof Types.ObjectId) &&
    ('startDate' in lane || 'missionDraftStartedAt' in lane || 'quest' in lane);

function fieldOf(lane: object, path: keyof LockLane): Date | null {
    const reader = lane as FieldReader & LockLane;
    const value =
        typeof reader.get === 'function' ? reader.get(path) : reader[path];
    return (value as Date | null | undefined) ?? null;
}

function laneDatesOf(lane: object): LockLane {
    return {
        startDate: fieldOf(lane, 'startDate'),
        missionDraftStartedAt: fieldOf(lane, 'missionDraftStartedAt'),
    };
}

// corsie popolate (findOne, payload di characterUpdated) → nessuna lettura; un id, una forma ignota o le corsie non lette → il reader (D-16)
export function lockLanesOf(
    character: { quests?: Record<string, unknown> | null } | null | undefined,
): LaneResolution {
    if (!character) return null;
    const quests = character.quests;
    if (!quests) return 'unresolved';

    const lanes: LockLanes = {};
    for (const name of QUEST_LANES) {
        const lane = quests[name];
        if (lane == null) {
            lanes[name] = null;
        } else if (isLaneId(lane) || !isPopulatedLane(lane)) {
            return 'unresolved';
        } else {
            lanes[name] = laneDatesOf(lane);
        }
    }
    return lanes;
}
