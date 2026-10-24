import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from 'test/auth/fixed-clock';
import { FakeTravelQueue } from 'test/travel/fake-travel-queue';
import { QuestResolutionScheduler } from './quest-resolution.scheduler';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const TIMEOUT_MS = 50;
const SEVEN_DAYS_MS = 604_800_000;

describe('QuestResolutionScheduler', () => {
    let queue: FakeTravelQueue;
    let scheduler: QuestResolutionScheduler;
    let warn: jest.SpyInstance;
    const pendingQuestId = new Types.ObjectId();
    const pqHex = pendingQuestId.toHexString();
    const aidQuestId = new Types.ObjectId();
    const aidHex = aidQuestId.toHexString();

    beforeEach(() => {
        queue = new FakeTravelQueue();
        scheduler = new QuestResolutionScheduler(
            queue as never,
            new FixedClock(NOW),
            TIMEOUT_MS,
        );
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    describe('scheduleResolution', () => {
        it('enqueues the resolve job at the deadline', async () => {
            await scheduler.scheduleResolution({
                pendingQuestId,
                startDate: NOW,
                waitingTime: 7_200_000,
            });

            expect(queue.added).toEqual([
                {
                    name: 'resolve',
                    data: {
                        pendingQuestId: pqHex,
                        startDate: NOW.getTime(),
                        waitingTime: 7_200_000,
                    },
                    options: {
                        jobId: `quest-${pqHex}-${NOW.getTime()}`,
                        delay: 7_200_000,
                        removeOnComplete: true,
                        removeOnFail: false,
                    },
                },
            ]);
        });

        it('fires at once when the deadline has passed', async () => {
            const startDate = new Date(NOW.getTime() - 10_000);

            await scheduler.scheduleResolution({
                pendingQuestId,
                startDate,
                waitingTime: 5_000,
            });

            expect(queue.added[0].options.delay).toBe(0);
        });

        it('warns without throwing when the queue rejects', async () => {
            queue.failAdd = true;

            await expect(
                scheduler.scheduleResolution({
                    pendingQuestId,
                    startDate: NOW,
                    waitingTime: 1_000,
                }),
            ).resolves.toBeUndefined();

            expect(warn).toHaveBeenCalledTimes(1);
            const message = String(warn.mock.calls[0][0]);
            expect(message).toContain(`quest-${pqHex}-${NOW.getTime()}`);
            expect(message).toContain('lo risolverà lo sweep');
        });

        it('returns within the timeout when the queue hangs', async () => {
            queue.hangAdd = true;
            const started = Date.now();

            await scheduler.scheduleResolution({
                pendingQuestId,
                startDate: NOW,
                waitingTime: 1_000,
            });

            expect(Date.now() - started).toBeLessThan(1_000);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain(
                `non confermato entro ${TIMEOUT_MS} ms`,
            );
        });
    });

    describe('scheduleAidTimeout', () => {
        it('enqueues the aid timeout 7 days after the aid started', async () => {
            await scheduler.scheduleAidTimeout({ aidQuestId, since: NOW });

            expect(queue.added).toEqual([
                {
                    name: 'aid-timeout',
                    data: { aidQuestId: aidHex, since: NOW.getTime() },
                    options: {
                        jobId: `aid-${aidHex}`,
                        delay: SEVEN_DAYS_MS,
                        removeOnComplete: true,
                        removeOnFail: false,
                    },
                },
            ]);
        });

        it('warns without throwing when the queue rejects', async () => {
            queue.failAdd = true;

            await scheduler.scheduleAidTimeout({ aidQuestId, since: NOW });

            expect(warn).toHaveBeenCalledTimes(1);
            const message = String(warn.mock.calls[0][0]);
            expect(message).toContain(`aid-${aidHex}`);
            expect(message).toContain('lo risolverà lo sweep');
        });
    });

    describe('onModuleInit', () => {
        it('warns once on Redis errors without connection details', () => {
            scheduler.onModuleInit();
            const error = Object.assign(
                new Error('connect ECONNREFUSED 10.0.0.1:6379'),
                {
                    code: 'ECONNREFUSED',
                },
            );

            queue.emit('error', error);
            queue.emit('error', error);

            expect(warn).toHaveBeenCalledTimes(1);
            const message = String(warn.mock.calls[0][0]);
            expect(message).toContain('ECONNREFUSED');
            expect(message).not.toContain('6379');
        });
    });
});
