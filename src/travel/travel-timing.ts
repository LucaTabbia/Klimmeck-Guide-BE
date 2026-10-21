import type { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { LonLat, RoadRoute } from 'src/roads/road-route';

export const BASE_SPEED = 10;

export interface TravelSpeed {
    speed: number;
    invalid: boolean;
}

export interface ActiveTravelDraft {
    road: { coordinates: LonLat[]; distance: number };
    startTime: Date;
    endTime: Date;
    duration: number;
    to: Types.ObjectId;
    kind: TravelKind;
}

export function speedOf(_modifier: unknown): TravelSpeed {
    throw new Error('not implemented');
}

export function durationMsOf(_baseHours: number, _speed: number): number {
    throw new Error('not implemented');
}

export function buildActiveTravel(_input: {
    route: RoadRoute;
    speed: number;
    now: Date;
    to: Types.ObjectId;
    kind: TravelKind;
}): ActiveTravelDraft {
    throw new Error('not implemented');
}
