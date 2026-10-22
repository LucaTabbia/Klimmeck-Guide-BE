import { Types } from 'mongoose';
import { objectIdFromHex } from 'src/mongo/document-id';
import { TravelIdentity } from './travel.updates';

export const TRAVEL_QUEUE = 'travel';
export const TRAVEL_COMPLETE_JOB = 'complete';

// epoch ms: niente Date serializzate in JSON nella coda
export interface TravelJobData {
    characterId: string;
    startTime: number;
    endTime: number;
}

// deterministico (discrezione D-12): Bull ignora un secondo add dello stesso viaggio e il teleport ricostruisce l'id senza persisterlo; niente ':' (chiavi bull:<queue>:<id>)
export function travelJobId(
    characterId: Types.ObjectId | string,
    startTime: Date | number,
): string {
    const id =
        typeof characterId === 'string'
            ? characterId
            : characterId.toHexString();
    const ms = typeof startTime === 'number' ? startTime : startTime.getTime();
    return `travel-${id}-${ms}`;
}

function isEpochMs(value: unknown): value is number {
    return (
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    );
}

// dati dalla coda = input non fidato: id esadecimale e interi non negativi, startTime ≤ endTime
export function travelJobDataOf(data: unknown): TravelIdentity | null {
    if (typeof data !== 'object' || data === null) return null;
    const { characterId, startTime, endTime } = data as Partial<
        Record<keyof TravelJobData, unknown>
    >;
    const id = objectIdFromHex(
        typeof characterId === 'string' ? characterId : null,
    );
    if (!id || !isEpochMs(startTime) || !isEpochMs(endTime)) return null;
    if (startTime > endTime) return null;
    return {
        characterId: id,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
    };
}
