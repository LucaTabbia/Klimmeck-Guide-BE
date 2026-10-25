import { Types } from 'mongoose';
import { objectIdFromHex } from 'src/mongo/document-id';
import { isEpochMs } from 'src/queues/epoch-ms';

export const QUEST_RESOLUTION_QUEUE = 'quest-resolution';
export const RESOLVE_QUEST_JOB = 'resolve';
export const AID_TIMEOUT_JOB = 'aid-timeout';
export const PARTY_TIMEOUT_JOB = 'party-timeout';

// epoch ms: niente Date serializzate in JSON nella coda
export interface ResolveQuestJobData {
    pendingQuestId: string;
    startDate: number;
    waitingTime: number;
}

export interface AidTimeoutJobData {
    aidQuestId: string;
    since: number;
}

export interface PartyTimeoutJobData {
    questId: string;
    since: number;
}

export interface ResolutionTrigger {
    pendingQuestId: Types.ObjectId;
    startDate: Date;
    waitingTime: number;
}

export interface AidTimeoutTrigger {
    aidQuestId: Types.ObjectId;
    since: Date;
}

// finestra delle 24 ore del party corrente (utente 2026-10-25)
export interface PartyTimeoutTrigger {
    questId: Types.ObjectId;
    since: Date;
}

// deterministici (D-24): Bull ignora un secondo add dello stesso trigger; niente ':' (chiavi bull:<queue>:<id>)
export function questResolutionJobId(
    pendingQuestId: Types.ObjectId,
    startDate: Date,
): string {
    return `quest-${pendingQuestId.toHexString()}-${startDate.getTime()}`;
}

export function aidTimeoutJobId(aidQuestId: Types.ObjectId): string {
    return `aid-${aidQuestId.toHexString()}`;
}

// un party nuovo dopo uno scioglimento ha un'altra finestra, quindi un altro job
export function partyTimeoutJobId(
    questId: Types.ObjectId,
    since: Date,
): string {
    return `party-${questId.toHexString()}-${since.getTime()}`;
}

// dati dalla coda = input non fidato: id esadecimale e interi non negativi; il processor rilegge comunque il DB (D-01)
export function resolveQuestJobDataOf(data: unknown): ResolutionTrigger | null {
    if (typeof data !== 'object' || data === null) return null;
    const { pendingQuestId, startDate, waitingTime } = data as Partial<
        Record<keyof ResolveQuestJobData, unknown>
    >;
    const id = objectIdFromHex(
        typeof pendingQuestId === 'string' ? pendingQuestId : null,
    );
    if (!id || !isEpochMs(startDate) || !isEpochMs(waitingTime)) return null;
    return {
        pendingQuestId: id,
        startDate: new Date(startDate),
        waitingTime,
    };
}

export function aidTimeoutJobDataOf(data: unknown): AidTimeoutTrigger | null {
    if (typeof data !== 'object' || data === null) return null;
    const { aidQuestId, since } = data as Partial<
        Record<keyof AidTimeoutJobData, unknown>
    >;
    const id = objectIdFromHex(
        typeof aidQuestId === 'string' ? aidQuestId : null,
    );
    if (!id || !isEpochMs(since)) return null;
    return { aidQuestId: id, since: new Date(since) };
}

export function partyTimeoutJobDataOf(
    data: unknown,
): PartyTimeoutTrigger | null {
    if (typeof data !== 'object' || data === null) return null;
    const { questId, since } = data as Partial<
        Record<keyof PartyTimeoutJobData, unknown>
    >;
    const id = objectIdFromHex(typeof questId === 'string' ? questId : null);
    if (!id || !isEpochMs(since)) return null;
    return { questId: id, since: new Date(since) };
}

export function resolutionDueAt(trigger: ResolutionTrigger): Date {
    return new Date(trigger.startDate.getTime() + trigger.waitingTime);
}
