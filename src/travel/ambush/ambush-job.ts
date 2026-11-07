import { Types } from 'mongoose';
import { objectIdFromHex } from 'src/mongo/document-id';
import { isEpochMs } from 'src/queues/epoch-ms';

export const AMBUSH_JOB = 'ambush';

// epoch ms: niente Date serializzate in JSON nella coda
export interface AmbushJobData {
    characterId: string;
    startTime: number;
    at: number;
}

export interface AmbushIdentity {
    characterId: Types.ObjectId;
    startTime: Date;
    at: Date;
}

const msOf = (instant: Date | number): number =>
    typeof instant === 'number' ? instant : instant.getTime();

// deterministico (D-05): Bull ignora un secondo add della stessa imboscata; niente ':' nell'id (chiavi bull:<queue>:<id>)
export function ambushJobId(
    characterId: Types.ObjectId | string,
    startTime: Date | number,
    at: Date | number,
): string {
    const id =
        typeof characterId === 'string'
            ? characterId
            : characterId.toHexString();
    return `ambush-${id}-${msOf(startTime)}-${msOf(at)}`;
}

// dati dalla coda = input non fidato: id esadecimale e interi non negativi, startTime ≤ at
export function ambushJobDataOf(data: unknown): AmbushIdentity | null {
    if (typeof data !== 'object' || data === null) return null;
    const { characterId, startTime, at } = data as Partial<
        Record<keyof AmbushJobData, unknown>
    >;
    const id = objectIdFromHex(
        typeof characterId === 'string' ? characterId : null,
    );
    if (!id || !isEpochMs(startTime) || !isEpochMs(at)) return null;
    if (startTime > at) return null;
    return {
        characterId: id,
        startTime: new Date(startTime),
        at: new Date(at),
    };
}
