import { Types } from 'mongoose';
import { AMBUSH_JOB, ambushJobDataOf, ambushJobId } from './ambush-job';

describe('ambush job', () => {
    const hex = '64b0000000000000000000a1';

    it('builds a deterministic ambush job id without colons (D-05)', () => {
        expect(AMBUSH_JOB).toBe('ambush');
        expect(ambushJobId(hex, 1000, 5000)).toBe(
            'ambush-64b0000000000000000000a1-1000-5000',
        );
        expect(
            ambushJobId(
                new Types.ObjectId(hex),
                new Date(1000),
                new Date(5000),
            ),
        ).toBe('ambush-64b0000000000000000000a1-1000-5000');
        expect(ambushJobId(hex, 1000, 5000)).not.toContain(':');
    });

    it('reads valid ambush job data as an identity (D-05)', () => {
        const identity = ambushJobDataOf({
            characterId: hex,
            startTime: 1000,
            at: 5000,
        });

        expect(identity).toEqual({
            characterId: new Types.ObjectId(hex),
            startTime: new Date(1000),
            at: new Date(5000),
        });
        expect(identity?.characterId).toBeInstanceOf(Types.ObjectId);
    });

    it('rejects malformed ambush job data (D-05)', () => {
        for (const data of [
            null,
            'x',
            {},
            { characterId: 'not-a-hex-id', startTime: 1000, at: 5000 },
            { characterId: hex, startTime: -1, at: 5000 },
            { characterId: hex, startTime: 1000, at: 1.5 },
            { characterId: hex, startTime: 1000, at: '5000' },
            { characterId: hex, startTime: 5000, at: 1000 },
        ]) {
            expect(ambushJobDataOf(data)).toBeNull();
        }
    });
});
