import { Types } from 'mongoose';
import {
    TRAVEL_COMPLETE_JOB,
    TRAVEL_QUEUE,
    travelJobDataOf,
    travelJobId,
} from './travel-job';

describe('travel job', () => {
    const id = new Types.ObjectId();
    const hex = id.toHexString();
    const start = new Date('2026-10-21T10:00:00.000Z');

    it('names the queue and the job', () => {
        expect(TRAVEL_QUEUE).toBe('travel');
        expect(TRAVEL_COMPLETE_JOB).toBe('complete');
    });

    describe('travelJobId', () => {
        it('is deterministic on character and start', () => {
            expect(travelJobId(id, start)).toBe(
                `travel-${id.toHexString()}-${start.getTime()}`,
            );
        });

        it('accepts the hex id and the milliseconds', () => {
            expect(travelJobId(hex, start.getTime())).toBe(
                travelJobId(id, start),
            );
        });

        it('has no colon', () => {
            expect(travelJobId(id, start)).not.toContain(':');
        });
    });

    describe('travelJobDataOf', () => {
        it('turns valid data into the travel identity', () => {
            const identity = travelJobDataOf({
                characterId: hex,
                startTime: 1,
                endTime: 2,
            });

            expect(identity).toEqual({
                characterId: new Types.ObjectId(hex),
                startTime: new Date(1),
                endTime: new Date(2),
            });
            expect(identity?.characterId).toBeInstanceOf(Types.ObjectId);
        });

        it.each([
            null,
            {},
            { characterId: 'abc', startTime: 1, endTime: 2 },
            { characterId: hex, startTime: '1', endTime: 2 },
            { characterId: hex, startTime: 2, endTime: 1 },
            { characterId: hex, startTime: -1, endTime: 2 },
            { characterId: hex, startTime: 1.5, endTime: 2 },
        ])('rejects %p', (data) => {
            expect(travelJobDataOf(data)).toBeNull();
        });
    });
});
