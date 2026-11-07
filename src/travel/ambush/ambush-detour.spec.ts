import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { LonLat } from 'src/roads/road-route';
import { detourFallbacksOf, residualDetourOf } from './ambush-detour';
import type { AmbushTravelSnapshot } from './ambush-plan';

const TO_ID = new Types.ObjectId('64b0000000000000000000c8');
const CITY_ID = new Types.ObjectId('64b0000000000000000000c7');
const START = new Date('2026-10-21T10:00:00.000Z');
const HOUR_MS = 3_600_000;

const travel: AmbushTravelSnapshot = {
    road: {
        coordinates: [
            [0, 0],
            [0, 9],
        ],
        distance: 20,
    },
    startTime: START,
    endTime: new Date(START.getTime() + 20 * HOUR_MS),
    duration: 20 * HOUR_MS,
    to: TO_ID,
    kind: TravelKind.free,
    ambush: { at: new Date(START.getTime() + 10 * HOUR_MS), km: 10 },
};

describe('ambush detour edges', () => {
    it('prefers the vertex after the point, then the one before (D-11)', () => {
        const road: LonLat[] = [
            [0, 0],
            [0, 4.5],
            [0, 9],
        ];
        expect(detourFallbacksOf(road, 2)).toEqual([
            [0, 9],
            [0, 4.5],
        ]);
        expect(detourFallbacksOf([[3, 4]], 0)).toEqual([[3, 4]]);
        expect(detourFallbacksOf(road, 1)).toEqual([
            [0, 4.5],
            [0, 0],
        ]);
    });

    it('keeps heading to the destination on the residual road when no city is reachable (D-11)', () => {
        const reachedCity = { id: CITY_ID, name: 'Borgo' };
        expect(
            residualDetourOf({
                travel,
                point: [0, 4.4966],
                segment: 1,
                reachedCity,
                petSpeed: 10,
            }),
        ).toEqual({
            road: {
                coordinates: [
                    [0, 4.4966],
                    [0, 9],
                ],
                distance: 10,
            },
            to: TO_ID,
            reachedCity,
            baseHours: null,
            residualMs: 36_000_000,
            petSpeed: 10,
        });
    });
});
