import { Types } from 'mongoose';

export const AID_TIMEOUT_MS = 0;

export const AID_TIMEOUT_REQUIRES_NO_RESCUER = {} as const;

export function aidTimeoutDueAt(since: Date): Date {
    return since;
}

export function isAidTimeoutDue(since: Date, now: Date): boolean {
    void since;
    void now;
    return false;
}

export function aidTimeoutClaimFilter(
    aidQuestId: Types.ObjectId,
): Record<string, unknown> {
    void aidQuestId;
    return {};
}

export function aidTimeoutSuspended(aid: {
    registeredAdventurers?: readonly unknown[] | null;
}): boolean {
    void aid;
    return false;
}
