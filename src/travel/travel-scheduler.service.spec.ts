import { Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { Types } from 'mongoose';
import { FAILED_JOBS_KEPT } from 'src/queues/enqueue-trigger';
import { FixedClock } from '../../test/auth/fixed-clock';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';
import { TRAVEL_COMPLETE_JOB, TravelJobData, travelJobId } from './travel-job';
import { TravelScheduler } from './travel-scheduler.service';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const START = new Date('2026-10-21T09:30:00.000Z');
const END = new Date('2026-10-21T11:00:00.000Z');
const TIMEOUT_MS = 20;

describe('TravelScheduler', () => {
    const characterId = new Types.ObjectId();
    const jobId = travelJobId(characterId, START);
    let queue: FakeTravelQueue;
    let scheduler: TravelScheduler;
    let warn: jest.SpyInstance;

    function warnings(): string[] {
        return warn.mock.calls.map(([value]) => String(value));
    }

    beforeEach(() => {
        queue = new FakeTravelQueue();
        scheduler = new TravelScheduler(
            queue as unknown as Queue<TravelJobData>,
            new FixedClock(NOW),
            TIMEOUT_MS,
        );
        scheduler.onModuleInit();
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('schedule', () => {
        it('enqueues the completion trigger at the travel end, keeping a bounded failed history (D-17a)', async () => {
            await scheduler.schedule(characterId, {
                startTime: START,
                endTime: END,
            });

            expect(queue.added).toEqual([
                {
                    name: TRAVEL_COMPLETE_JOB,
                    data: {
                        characterId: characterId.toHexString(),
                        startTime: START.getTime(),
                        endTime: END.getTime(),
                    },
                    options: {
                        jobId,
                        delay: END.getTime() - NOW.getTime(),
                        removeOnComplete: true,
                        removeOnFail: FAILED_JOBS_KEPT,
                    },
                },
            ]);
            expect(warnings()).toEqual([]);
        });

        it('fires at once for a travel already over', async () => {
            await scheduler.schedule(characterId, {
                startTime: START,
                endTime: new Date(NOW.getTime() - 1_000),
            });

            expect(queue.added[0].options.delay).toBe(0);
        });

        it('warns and relies on the sweep when the travel job cannot be enqueued', async () => {
            queue.failAdd = true;

            await expect(
                scheduler.schedule(characterId, {
                    startTime: START,
                    endTime: END,
                }),
            ).resolves.toBeUndefined();

            expect(queue.added).toEqual([]);
            expect(warnings()).toEqual([
                `Accodamento del viaggio ${jobId} fallito: lo completerà lo sweep`,
            ]);
        });

        it('warns and relies on the sweep when the queue does not answer within the timeout', async () => {
            queue.hangAdd = true;

            await expect(
                scheduler.schedule(characterId, {
                    startTime: START,
                    endTime: END,
                }),
            ).resolves.toBeUndefined();

            expect(warnings()).toEqual([
                `Accodamento del viaggio ${jobId} non confermato entro ${TIMEOUT_MS} ms: lo completerà lo sweep`,
            ]);
        });
    });

    describe('cancel', () => {
        async function scheduled(): Promise<void> {
            await scheduler.schedule(characterId, {
                startTime: START,
                endTime: END,
            });
        }

        it('removes the job of the travel', async () => {
            await scheduled();

            await scheduler.cancel(characterId, START);

            expect(queue.removed).toEqual([jobId]);
            expect(warnings()).toEqual([]);
        });

        it('does nothing when the job is already gone', async () => {
            await scheduler.cancel(characterId, START);

            expect(queue.removed).toEqual([]);
            expect(warnings()).toEqual([]);
        });

        it('warns without throwing when the removal fails', async () => {
            await scheduled();
            queue.failRemove = true;

            await expect(
                scheduler.cancel(characterId, START),
            ).resolves.toBeUndefined();

            expect(warnings()).toEqual([
                `Rimozione del job ${jobId} non riuscita: il job si neutralizza da solo`,
            ]);
        });

        it('warns without waiting when the removal does not answer within the timeout', async () => {
            await scheduled();
            queue.hangRemove = true;

            await expect(
                scheduler.cancel(characterId, START),
            ).resolves.toBeUndefined();

            expect(warnings()).toEqual([
                `Rimozione del job ${jobId} non confermata entro ${TIMEOUT_MS} ms: il job si neutralizza da solo`,
            ]);
        });
    });

    describe('Redis errors', () => {
        it.each([
            [
                'the errno code',
                Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:6379'), {
                    code: 'ECONNREFUSED',
                }),
                'ECONNREFUSED',
            ],
            [
                'the error name without a code',
                new TypeError('fake-redis-failure at 10.0.0.1'),
                'TypeError',
            ],
            ['unknown without an error', undefined, 'unknown'],
        ])(
            'warns once per process with %s and no connection details',
            (_label, error, code) => {
                queue.emit('error', error);
                queue.emit('error', error);

                expect(warnings()).toEqual([
                    `Redis non raggiungibile (${code}): i job di viaggio partiranno al riconnesso, lo sweep copre`,
                ]);
            },
        );
    });
});
