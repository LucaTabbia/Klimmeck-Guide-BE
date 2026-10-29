import { FAILED_JOBS_KEPT } from 'src/queues/enqueue-trigger';
import { Logger } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { questEnd } from 'src/push/push-events';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import type { ParticipantPlan } from './outcome-plan';
import {
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const TIMEOUT_MS = 50;
const SESSION = {} as ClientSession;

const execOf = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
});

function fakeModels() {
    return {
        character: { findOneAndUpdate: jest.fn(() => execOf({ _id: 1 })) },
        quest: {
            updateOne: jest.fn(() => execOf({ matchedCount: 1 })),
            create: jest.fn().mockResolvedValue([]),
        },
        pendingQuest: { deleteOne: jest.fn(() => execOf({ deletedCount: 1 })) },
        questResult: { create: jest.fn().mockResolvedValue([]) },
    };
}

describe('OutcomeWriter', () => {
    let models: ReturnType<typeof fakeModels>;
    let wallet: { applyCharacterCoinsDelta: jest.Mock };
    let push: { sendToUser: jest.Mock };
    let scheduler: { scheduleAidTimeout: jest.Mock };
    let queue: FakeTravelQueue;
    let writer: OutcomeWriter;
    let warn: jest.SpyInstance;
    const resultId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const aidQuestId = new Types.ObjectId();
    const characterId = new Types.ObjectId().toHexString();
    const spellId = new Types.ObjectId().toHexString();

    beforeEach(() => {
        models = fakeModels();
        wallet = { applyCharacterCoinsDelta: jest.fn().mockResolvedValue({}) };
        push = { sendToUser: jest.fn().mockResolvedValue({}) };
        scheduler = {
            scheduleAidTimeout: jest.fn().mockResolvedValue(undefined),
        };
        queue = new FakeTravelQueue();
        writer = new OutcomeWriter(
            models.character as never,
            models.quest as never,
            models.pendingQuest as never,
            models.questResult as never,
            wallet as never,
            push as never,
            scheduler as never,
            queue as never,
            TIMEOUT_MS,
            new FixedClock(NOW),
        );
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    describe('deliver', () => {
        const dueAt = new Date(NOW.getTime() + 5000);
        const recovery = () => ({ characterId, spellId, dueAt });
        const committed = () => ({
            results: [{ resultId, userId }],
            aids: [{ aidQuestId, since: NOW }],
            spellRecoveries: [recovery()],
        });

        it('pushes questEnd with the result id to the result user', async () => {
            await writer.deliver(committed());

            expect(push.sendToUser).toHaveBeenCalledTimes(1);
            expect(push.sendToUser).toHaveBeenCalledWith(
                userId,
                questEnd(resultId.toHexString()),
            );
        });

        it('schedules the aid timeout of every created aid', async () => {
            await writer.deliver(committed());

            expect(scheduler.scheduleAidTimeout).toHaveBeenCalledTimes(1);
            expect(scheduler.scheduleAidTimeout).toHaveBeenCalledWith({
                aidQuestId,
                since: NOW,
            });
        });

        it('enqueues one recover trigger per spent spell with its due instant', async () => {
            await writer.deliver(committed());

            expect(queue.added).toHaveLength(1);
            const [job] = queue.added;
            expect(job.name).toBe('recover');
            expect(job.data).toEqual({
                characterId,
                spellId,
                dueAt: dueAt.getTime(),
            });
            expect(job.options).toEqual({
                jobId: `spell-${characterId}-${spellId}-${dueAt.getTime()}`,
                delay: 5000,
                removeOnComplete: true,
                removeOnFail: FAILED_JOBS_KEPT,
            });
        });

        it('gives the same id to triggers of the same spell and instant', async () => {
            await writer.deliver({
                ...committed(),
                spellRecoveries: [recovery(), recovery()],
            });

            const [first, second] = queue.added;
            expect(first.options.jobId).toBe(second.options.jobId);
        });

        it('warns with ids only when the spell recovery queue rejects', async () => {
            queue.failAdd = true;

            await expect(writer.deliver(committed())).resolves.toBeUndefined();

            expect(warn).toHaveBeenCalledTimes(1);
            const message = String(warn.mock.calls[0][0]);
            expect(message).toContain(characterId);
            expect(message).toContain(spellId);
            expect(message).toContain('lo restituirà lo sweep');
            expect(message).not.toContain('queue unavailable');
        });

        it('warns when the spell recovery queue does not answer in time', async () => {
            queue.hangAdd = true;

            await expect(writer.deliver(committed())).resolves.toBeUndefined();

            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain(spellId);
        });

        it('keeps delivering when the push of one result fails', async () => {
            const otherResult = new Types.ObjectId();
            const otherUser = new Types.ObjectId();
            push.sendToUser.mockRejectedValueOnce(new Error('boom'));

            await expect(
                writer.deliver({
                    ...committed(),
                    results: [
                        { resultId, userId },
                        { resultId: otherResult, userId: otherUser },
                    ],
                }),
            ).resolves.toBeUndefined();

            expect(push.sendToUser).toHaveBeenCalledTimes(2);
            expect(push.sendToUser).toHaveBeenLastCalledWith(
                otherUser,
                questEnd(otherResult.toHexString()),
            );
            expect(scheduler.scheduleAidTimeout).toHaveBeenCalledTimes(1);
            expect(queue.added).toHaveLength(1);
            expect(String(warn.mock.calls[0][0])).toContain(
                resultId.toHexString(),
            );
        });
    });

    describe('session writes', () => {
        const plan = (coinsDelta: number): ParticipantPlan =>
            ({
                filter: { _id: 'c' },
                update: { $set: {} },
                coinsDelta,
                result: { _id: resultId, character: new Types.ObjectId() },
                spellRecoveries: [],
            }) as unknown as ParticipantPlan;

        it('writes the character, the coins and the result in the session', async () => {
            const draft = plan(150);

            await writer.writeParticipant(draft, SESSION);

            expect(models.character.findOneAndUpdate).toHaveBeenCalledWith(
                draft.filter,
                draft.update,
                expect.objectContaining({ session: SESSION }),
            );
            expect(wallet.applyCharacterCoinsDelta).toHaveBeenCalledWith(
                draft.result.character,
                150,
                SESSION,
            );
            expect(models.questResult.create).toHaveBeenCalledWith(
                [draft.result],
                { session: SESSION },
            );
        });

        it('skips the wallet when no coins are earned', async () => {
            await writer.writeParticipant(plan(0), SESSION);

            expect(wallet.applyCharacterCoinsDelta).not.toHaveBeenCalled();
        });

        it('throws StaleResolution when the character no longer matches', async () => {
            models.character.findOneAndUpdate.mockReturnValueOnce(execOf(null));

            await expect(
                writer.writeParticipant(plan(150), SESSION),
            ).rejects.toBeInstanceOf(StaleResolution);
            expect(models.questResult.create).not.toHaveBeenCalled();
        });

        it('throws StaleResolution when the pending quest is already gone', async () => {
            models.pendingQuest.deleteOne.mockReturnValueOnce(
                execOf({ deletedCount: 0 }),
            );

            await expect(
                writer.deletePendingQuest(new Types.ObjectId(), SESSION),
            ).rejects.toBeInstanceOf(StaleResolution);
        });

        it('throws StaleResolution on a lost quest claim', async () => {
            models.quest.updateOne.mockReturnValueOnce(
                execOf({ matchedCount: 0 }),
            );

            await expect(
                writer.updateQuest(
                    { _id: 'q' },
                    { $set: {} },
                    SESSION,
                    'claim',
                ),
            ).rejects.toBeInstanceOf(StaleResolution);
        });

        it('warns and goes on when a best-effort quest update matches nothing', async () => {
            models.quest.updateOne.mockReturnValueOnce(
                execOf({ matchedCount: 0 }),
            );
            const questId = new Types.ObjectId();

            await expect(
                writer.updateQuest(
                    { _id: questId },
                    { $set: {} },
                    SESSION,
                    'bestEffort',
                ),
            ).resolves.toBeUndefined();
            expect(String(warn.mock.calls[0][0])).toContain(
                questId.toHexString(),
            );
        });

        it('writes nothing for a null quest update', async () => {
            await writer.updateQuest({ _id: 'q' }, null, SESSION, 'claim');

            expect(models.quest.updateOne).not.toHaveBeenCalled();
        });
    });
});

describe('emptyCommitted', () => {
    it('hands out fresh arrays so one outcome never leaks into the next', () => {
        const first = emptyCommitted();
        first.results.push({
            resultId: new Types.ObjectId(),
            userId: new Types.ObjectId(),
        });
        first.aids.push({ aidQuestId: new Types.ObjectId(), since: NOW });
        first.spellRecoveries.push({
            characterId: 'c',
            spellId: 's',
            dueAt: NOW,
        });

        expect(emptyCommitted()).toEqual({
            results: [],
            aids: [],
            spellRecoveries: [],
        });
    });
});
