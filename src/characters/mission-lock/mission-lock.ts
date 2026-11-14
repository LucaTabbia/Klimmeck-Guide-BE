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
