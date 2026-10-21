import type { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { LonLat, RoadRoute } from 'src/roads/road-route';

// velocità base del personaggio (D-08): futuro attributo del personaggio (deferred), oggi costante
export const BASE_SPEED = 10;
const MS_PER_HOUR = 3_600_000;

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

// null = non cavalcabile; un modificatore non valido vale come assente e il chiamante logga il solo id del pet (D-08)
export function speedOf(modifier: unknown): TravelSpeed {
    if (modifier === null || modifier === undefined)
        return { speed: BASE_SPEED, invalid: false };
    if (
        typeof modifier !== 'number' ||
        !Number.isFinite(modifier) ||
        modifier <= 0
    )
        return { speed: BASE_SPEED, invalid: true };
    return { speed: BASE_SPEED * modifier, invalid: false };
}

// ore reali, nessuna scala né clamp (D-07): la regolazione passa da Road.speedFactor a DB
export function durationMsOf(baseHours: number, speed: number): number {
    return Math.round((baseHours * MS_PER_HOUR * BASE_SPEED) / speed);
}

// velocità fotografata alla partenza (D-09): endTime persistito è la fonte di verità
export function buildActiveTravel(input: {
    route: RoadRoute;
    speed: number;
    now: Date;
    to: Types.ObjectId;
    kind: TravelKind;
}): ActiveTravelDraft {
    const duration = durationMsOf(input.route.baseHours, input.speed);
    const start = input.now.getTime();
    return {
        road: {
            coordinates: input.route.coordinates.map(
                ([lon, lat]): LonLat => [lon, lat],
            ),
            distance: input.route.distanceKm,
        },
        startTime: new Date(start),
        endTime: new Date(start + duration),
        duration,
        to: input.to,
        kind: input.kind,
    };
}
