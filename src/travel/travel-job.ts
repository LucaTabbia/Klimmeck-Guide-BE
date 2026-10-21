import { Types } from 'mongoose';
import { TravelIdentity } from './travel.updates';

export const TRAVEL_QUEUE = '';
export const TRAVEL_COMPLETE_JOB = '';

export interface TravelJobData {
    characterId: string;
    startTime: number;
    endTime: number;
}

export function travelJobId(
    _characterId: Types.ObjectId | string,
    _startTime: Date | number,
): string {
    throw new Error('not implemented');
}

export function travelJobDataOf(_data: unknown): TravelIdentity | null {
    throw new Error('not implemented');
}
