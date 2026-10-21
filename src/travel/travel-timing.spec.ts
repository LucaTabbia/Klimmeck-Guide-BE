import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import {
    BASE_SPEED,
    buildActiveTravel,
    durationMsOf,
    speedOf,
} from './travel-timing';

describe('travel timing', () => {
    it('has a base speed of 10', () => {
        expect(BASE_SPEED).toBe(10);
    });

    describe('speedOf', () => {
        it.each([
            [null, 10, false],
            [undefined, 10, false],
            [1, 10, false],
            [2, 20, false],
            [0.5, 5, false],
            [0, 10, true],
            [-1, 10, true],
            [NaN, 10, true],
            [Infinity, 10, true],
            ['2', 10, true],
        ])(
            'modifier %p → speed %p (invalid %p)',
            (modifier, speed, invalid) => {
                expect(speedOf(modifier)).toEqual({ speed, invalid });
            },
        );
    });

    describe('durationMsOf', () => {
        it('lasts the base hours at base speed', () => {
            expect(durationMsOf(2, 10)).toBe(7_200_000);
        });

        it('halves with double speed', () => {
            expect(durationMsOf(2, 20)).toBe(3_600_000);
        });

        it('rounds to whole milliseconds', () => {
            expect(durationMsOf(2.6432, 10)).toBe(
                Math.round(2.6432 * 3_600_000),
            );
            expect(Number.isInteger(durationMsOf(1 / 3, 10))).toBe(true);
        });
    });

    describe('buildActiveTravel', () => {
        const to = new Types.ObjectId();

        it('builds the persisted travel from the route and the server speed', () => {
            const now = new Date('2026-10-21T10:00:00.000Z');
            const travel = buildActiveTravel({
                route: {
                    coordinates: [
                        [0, 0],
                        [0, 0.2],
                    ],
                    distanceKm: 0.44,
                    baseHours: 2,
                },
                speed: 20,
                now,
                to,
                kind: TravelKind.free,
            });

            expect(travel).toEqual({
                road: {
                    coordinates: [
                        [0, 0],
                        [0, 0.2],
                    ],
                    distance: 0.44,
                },
                startTime: new Date('2026-10-21T10:00:00.000Z'),
                endTime: new Date('2026-10-21T11:00:00.000Z'),
                duration: 3_600_000,
                to,
                kind: 'free',
            });
            expect(travel.endTime.getTime() - travel.startTime.getTime()).toBe(
                travel.duration,
            );
        });

        it('copies the start instant', () => {
            const now = new Date('2026-10-21T10:00:00.000Z');
            const travel = buildActiveTravel({
                route: {
                    coordinates: [
                        [0, 0],
                        [0, 0.2],
                    ],
                    distanceKm: 0.44,
                    baseHours: 2,
                },
                speed: 10,
                now,
                to,
                kind: TravelKind.quest,
            });

            now.setTime(0);

            expect(travel.startTime).toEqual(
                new Date('2026-10-21T10:00:00.000Z'),
            );
            expect(travel.endTime).toEqual(
                new Date('2026-10-21T12:00:00.000Z'),
            );
        });
    });
});
