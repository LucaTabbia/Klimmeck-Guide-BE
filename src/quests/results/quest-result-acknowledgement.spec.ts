import { Types } from 'mongoose';
import {
    acknowledgementFilterOf,
    acknowledgementUpdateOf,
    UNACKNOWLEDGED_RESULTS_LIMIT,
    UNACKNOWLEDGED_RESULTS_SORT,
    unacknowledgedResultsFilterOf,
} from './quest-result-acknowledgement';

describe('quest result confirmation builders', () => {
    const userId = new Types.ObjectId();
    const resultId = new Types.ObjectId();

    it('caps the unconfirmed list at 50 results', () => {
        expect(UNACKNOWLEDGED_RESULTS_LIMIT).toBe(50);
    });

    it('sorts the unconfirmed list oldest first with the id as tie-breaker', () => {
        expect(UNACKNOWLEDGED_RESULTS_SORT).toEqual({ resolvedAt: 1, _id: 1 });
        expect(Object.keys(UNACKNOWLEDGED_RESULTS_SORT)).toEqual([
            'resolvedAt',
            '_id',
        ]);
    });

    it('filters the unconfirmed results of one user', () => {
        expect(unacknowledgedResultsFilterOf(userId)).toEqual({
            user: userId,
            acknowledgedAt: null,
        });
    });

    it('confirms only an unconfirmed result of its user', () => {
        expect(acknowledgementFilterOf(resultId, userId)).toEqual({
            _id: resultId,
            user: userId,
            acknowledgedAt: null,
        });
    });

    it('writes the confirmation time', () => {
        const now = new Date('2026-10-27T12:00:00.000Z');

        expect(acknowledgementUpdateOf(now)).toEqual({
            $set: { acknowledgedAt: now },
        });
    });
});
