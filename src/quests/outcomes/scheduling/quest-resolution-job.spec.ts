import { Types } from 'mongoose';
import {
    AID_TIMEOUT_JOB,
    aidTimeoutJobDataOf,
    aidTimeoutJobId,
    PARTY_TIMEOUT_JOB,
    partyTimeoutJobDataOf,
    partyTimeoutJobId,
    QUEST_RESOLUTION_QUEUE,
    questResolutionJobId,
    RESOLVE_QUEST_JOB,
    resolutionDueAt,
    resolveQuestJobDataOf,
} from './quest-resolution-job';

describe('quest resolution job', () => {
    const pendingQuestId = new Types.ObjectId();
    const pqHex = pendingQuestId.toHexString();
    const aidQuestId = new Types.ObjectId();
    const aidHex = aidQuestId.toHexString();

    it('names the queue and the jobs', () => {
        expect(QUEST_RESOLUTION_QUEUE).toBe('quest-resolution');
        expect(RESOLVE_QUEST_JOB).toBe('resolve');
        expect(AID_TIMEOUT_JOB).toBe('aid-timeout');
        expect(PARTY_TIMEOUT_JOB).toBe('party-timeout');
    });

    describe('party timeout (utente 2026-10-25)', () => {
        const questId = new Types.ObjectId();
        const questHex = questId.toHexString();

        it('derives the id from the quest and the start of the party window', () => {
            expect(partyTimeoutJobId(questId, new Date(3_000))).toBe(
                `party-${questHex}-3000`,
            );
            expect(partyTimeoutJobId(questId, new Date(3_000))).not.toContain(
                ':',
            );
        });

        it('turns valid data into the party timeout trigger', () => {
            const trigger = partyTimeoutJobDataOf({
                questId: questHex,
                since: 3000,
            });

            expect(trigger).toEqual({ questId, since: new Date(3000) });
            expect(trigger?.questId).toBeInstanceOf(Types.ObjectId);
        });

        it.each([
            null,
            7,
            { questId: 'not-hex', since: 3000 },
            { questId: questHex, since: -1 },
            { questId: questHex, since: 1.5 },
            { questId: questHex },
        ])('rejects untrusted data %p', (data) => {
            expect(partyTimeoutJobDataOf(data)).toBeNull();
        });
    });

    describe('job ids', () => {
        it('derives the resolution id from the pending quest and the start', () => {
            expect(questResolutionJobId(pendingQuestId, new Date(1_000))).toBe(
                `quest-${pqHex}-1000`,
            );
        });

        it('derives the aid timeout id from the aid quest', () => {
            expect(aidTimeoutJobId(aidQuestId)).toBe(`aid-${aidHex}`);
        });

        it('has no colon', () => {
            expect(
                questResolutionJobId(pendingQuestId, new Date(1_000)),
            ).not.toContain(':');
            expect(aidTimeoutJobId(aidQuestId)).not.toContain(':');
        });
    });

    describe('resolveQuestJobDataOf', () => {
        it('turns valid data into the resolution trigger', () => {
            const trigger = resolveQuestJobDataOf({
                pendingQuestId: pqHex,
                startDate: 1000,
                waitingTime: 7_200_000,
            });

            expect(trigger).toEqual({
                pendingQuestId,
                startDate: new Date(1000),
                waitingTime: 7_200_000,
            });
            expect(trigger?.pendingQuestId).toBeInstanceOf(Types.ObjectId);
        });

        it.each([
            null,
            undefined,
            'quest',
            { pendingQuestId: 'not-hex', startDate: 1000, waitingTime: 0 },
            { pendingQuestId: pqHex, startDate: -1, waitingTime: 0 },
            { pendingQuestId: pqHex, startDate: 1.5, waitingTime: 0 },
            { pendingQuestId: pqHex, startDate: '1000', waitingTime: 0 },
            { pendingQuestId: pqHex, startDate: 1000, waitingTime: -1 },
            { pendingQuestId: pqHex, startDate: 1000 },
        ])('rejects untrusted data %p', (data) => {
            expect(resolveQuestJobDataOf(data)).toBeNull();
        });
    });

    describe('aidTimeoutJobDataOf', () => {
        it('turns valid data into the aid timeout trigger', () => {
            const trigger = aidTimeoutJobDataOf({
                aidQuestId: aidHex,
                since: 2000,
            });

            expect(trigger).toEqual({ aidQuestId, since: new Date(2000) });
            expect(trigger?.aidQuestId).toBeInstanceOf(Types.ObjectId);
        });

        it.each([
            null,
            42,
            { aidQuestId: 'not-hex', since: 2000 },
            { aidQuestId: aidHex, since: -5 },
            { aidQuestId: aidHex, since: 2.5 },
            { aidQuestId: aidHex },
        ])('rejects untrusted data %p', (data) => {
            expect(aidTimeoutJobDataOf(data)).toBeNull();
        });
    });

    describe('resolutionDueAt', () => {
        it('adds the waiting time to the start', () => {
            expect(
                resolutionDueAt({
                    pendingQuestId,
                    startDate: new Date(1000),
                    waitingTime: 500,
                }),
            ).toEqual(new Date(1500));
        });
    });
});
