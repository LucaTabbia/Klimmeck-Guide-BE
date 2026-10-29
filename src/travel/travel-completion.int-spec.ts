import { FAILED_JOBS_KEPT } from 'src/queues/enqueue-trigger';
import { getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { PushDevice } from 'src/push/push-device.model';
import { travelEnd } from 'src/push/push-events';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushService } from 'src/push/push.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { TravelCompletionService } from './travel-completion.service';
import { TRAVEL_QUEUE } from './travel-job';
import { TravelSweeper } from './travel-sweeper';
import { TravelModule } from './travel.module';
import { TravelIdentity } from './travel.updates';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { createPlayer } from '../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistQuest,
} from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { buildActiveTravelDoc } from '../../test/travel/active-travel.fixture';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const START = new Date('2026-10-21T08:00:00.000Z');
const END = new Date('2026-10-21T09:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const STARTED_AT = new Date('2026-10-21T09:30:00.000Z');
const HOUR_MS = 3_600_000;
const BOOT_DEADLINE_MS = 10_000;
const POLL_STEP_MS = 100;
const BOOT_TEST_TIMEOUT_MS = 30_000;

const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

describe('TravelCompletionService (replSet)', () => {
    let harness: AuthTestApp;
    let completion: TravelCompletionService;
    let pushService: PushService;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let quests: Model<QuestDocument>;
    let users: Model<UserDocument>;
    let clock: FixedClock;
    let seq = 0;
    const push = new FakePushTransport();
    const questQueue = new FakeTravelQueue();
    const overrides = [
        { token: PushTransport, useValue: push },
        { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
        { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
        // TravelModule registra la coda via TravelPlanningModule: niente Redis nell'harness (vale anche per l'app del boot)
        { token: getQueueToken(TRAVEL_QUEUE), useValue: new FakeTravelQueue() },
        { token: getQueueToken(QUEST_RESOLUTION_QUEUE), useValue: questQueue },
    ];

    beforeAll(async () => {
        clock = new FixedClock(NOW);
        harness = await createAuthTestApp({
            clock,
            imports: [TravelModule],
            overrides,
        });
        completion = harness.app.get(TravelCompletionService);
        pushService = harness.app.get(PushService);
        characters = harness.app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        pendingQuests = harness.app.get<Model<PendingQuestDocument>>(
            getModelToken(PendingQuest.name),
        );
        quests = harness.app.get<Model<QuestDocument>>(
            getModelToken(Quest.name),
        );
        users = harness.app.get<Model<UserDocument>>(getModelToken(User.name));
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            pendingQuests.init(),
            quests.init(),
            users.init(),
            harness.connection.model(PushDevice.name).init(),
        ]);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        push.reset();
        questQueue.reset();
    });

    afterAll(async () => {
        await harness.close();
    });

    function travelStatus(
        destination: Types.ObjectId,
        travel: Record<string, unknown> = {},
    ) {
        return {
            ...buildCharacter().status,
            location: new Types.ObjectId(),
            activeTravel: buildActiveTravelDoc({ to: destination, ...travel }),
        };
    }

    // personaggio in viaggio con proprietario e un device registrato
    async function ownedTraveller(
        destination: Types.ObjectId,
        overrides: {
            travel?: Record<string, unknown>;
            character?: Record<string, unknown>;
        } = {},
    ): Promise<Types.ObjectId> {
        seq += 1;
        const player = await createPlayer(harness, {
            twitchId: `tw-travel-${seq}`,
            characterOverrides: {
                status: travelStatus(destination, overrides.travel),
                ...overrides.character,
            },
        });
        await pushService.registerDevice(String(player.user._id), {
            deviceId: 'dev-1',
            token: 'tok-1',
            platform: PushPlatform.android,
        });
        return player.character!._id as Types.ObjectId;
    }

    async function orphanTraveller(
        destination: Types.ObjectId,
        travel: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        seq += 1;
        const character = await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name: `Orfano ${seq}` },
            status: travelStatus(destination, travel),
        });
        return character._id as Types.ObjectId;
    }

    function identityOf(
        characterId: Types.ObjectId,
        overrides: Partial<TravelIdentity> = {},
    ): TravelIdentity {
        return { characterId, startTime: START, endTime: END, ...overrides };
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    // una hunt vera dietro la PendingQuest: l'avvio all'arrivo rilegge la quest (QuestStartService)
    async function persistPendingQuest(
        startDate: Date | null,
        waitingTime = 3_600_000,
        questId?: Types.ObjectId,
    ) {
        const quest =
            questId ?? ((await persistQuest(quests))._id as Types.ObjectId);
        return pendingQuests.create({
            startDate,
            arrivedAt: startDate,
            waitingTime,
            pointsSpent: 0,
            quest,
        });
    }

    it('completes an expired free travel and pushes travelEnd to the owner', async () => {
        const destination = new Types.ObjectId();
        const id = await ownedTraveller(destination);

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        const raw = await rawCharacter(id);
        expect(raw?.status.location).toEqual(destination);
        expect(raw?.status.activeTravel).toBeNull();
        expect(push.sent).toEqual([
            { tokens: ['tok-1'], message: travelEnd(id.toHexString()) },
        ]);
    });

    it('is a no-op for a duplicate or replayed trigger', async () => {
        const id = await ownedTraveller(new Types.ObjectId());

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );
        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'stale',
        );

        expect(push.sent).toHaveLength(1);
    });

    it('ignores a stale identity', async () => {
        const id = await ownedTraveller(new Types.ObjectId());
        const before = await rawCharacter(id);

        await expect(
            completion.complete(
                identityOf(id, {
                    startTime: new Date(START.getTime() + 1),
                }),
            ),
        ).resolves.toBe('stale');

        expect(await rawCharacter(id)).toEqual(before);
        expect(push.sent).toEqual([]);
    });

    it('does not complete a travel before its endTime', async () => {
        const endTime = new Date(NOW.getTime() + 60_000);
        const id = await ownedTraveller(new Types.ObjectId(), {
            travel: { endTime, duration: endTime.getTime() - START.getTime() },
        });
        const before = await rawCharacter(id);

        await expect(
            completion.complete(identityOf(id, { endTime })),
        ).resolves.toBe('stale');

        expect(await rawCharacter(id)).toEqual(before);
        expect(push.sent).toEqual([]);
    });

    it('skips an archived character', async () => {
        const id = await ownedTraveller(new Types.ObjectId(), {
            character: { deletedAt: ARCHIVED_AT },
        });
        const before = await rawCharacter(id);

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'stale',
        );

        expect(await rawCharacter(id)).toEqual(before);
        expect(push.sent).toEqual([]);
    });

    it('starts the quest countdown at the planned arrival without any push', async () => {
        const pending = await persistPendingQuest(null);
        const destination = new Types.ObjectId();
        const id = await ownedTraveller(destination, {
            travel: { kind: 'quest' },
            character: {
                quests: { completedQuests: [], pendingQuest: pending._id },
            },
        });

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        const quest = await pendingQuests.collection.findOne({
            _id: pending._id,
        });
        expect(quest?.arrivedAt).toEqual(END);
        expect(quest?.startDate).toEqual(END);
        expect((await rawCharacter(id))?.status.location).toEqual(destination);
        expect(push.sent).toEqual([]);
    });

    it('keeps a countdown that already started', async () => {
        const pending = await persistPendingQuest(STARTED_AT);
        const id = await ownedTraveller(new Types.ObjectId(), {
            travel: { kind: 'quest' },
            character: {
                quests: { completedQuests: [], pendingQuest: pending._id },
            },
        });

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        const quest = await pendingQuests.collection.findOne({
            _id: pending._id,
        });
        expect(quest?.startDate).toEqual(STARTED_AT);
        expect(push.sent).toEqual([]);
    });

    it('completes without a push when no user owns the character', async () => {
        const destination = new Types.ObjectId();
        const id = await orphanTraveller(destination);

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        expect((await rawCharacter(id))?.status.location).toEqual(destination);
        expect(push.sent).toEqual([]);
    });

    it('pushes once under concurrent completions', async () => {
        const id = await ownedTraveller(new Types.ObjectId());

        const outcomes = await Promise.all([
            completion.complete(identityOf(id)),
            completion.complete(identityOf(id)),
        ]);

        expect([...outcomes].sort()).toEqual(['completed', 'stale']);
        expect(push.sent).toHaveLength(1);
    });
    describe('resolution job at the arrival (D-24, C8)', () => {
        async function questTraveller(
            waitingTime: number,
        ): Promise<{ id: Types.ObjectId; pqId: Types.ObjectId }> {
            const pending = await persistPendingQuest(null, waitingTime);
            const id = await ownedTraveller(new Types.ObjectId(), {
                travel: { kind: 'quest' },
                character: {
                    quests: { completedQuests: [], pendingQuest: pending._id },
                },
            });
            return { id, pqId: pending._id as Types.ObjectId };
        }

        it('enqueues the resolution from the planned arrival', async () => {
            const waitingTime = 2 * HOUR_MS;
            const { id, pqId } = await questTraveller(waitingTime);

            await completion.complete(identityOf(id));

            const hex = pqId.toHexString();
            expect(questQueue.added).toEqual([
                {
                    name: 'resolve',
                    data: {
                        pendingQuestId: hex,
                        startDate: END.getTime(),
                        waitingTime,
                    },
                    options: {
                        jobId: `quest-${hex}-${END.getTime()}`,
                        delay: END.getTime() + waitingTime - NOW.getTime(),
                        removeOnComplete: true,
                        removeOnFail: FAILED_JOBS_KEPT,
                    },
                },
            ]);
        });

        it('fires at once when the countdown has already run out', async () => {
            const { id } = await questTraveller(HOUR_MS / 2);

            await completion.complete(identityOf(id));

            expect(questQueue.added).toHaveLength(1);
            expect(questQueue.added[0].options.delay).toBe(0);
        });

        it('enqueues nothing for a free travel', async () => {
            const id = await ownedTraveller(new Types.ObjectId());

            await completion.complete(identityOf(id));

            expect(questQueue.added).toEqual([]);
        });

        it('enqueues nothing for a stale completion', async () => {
            const { id } = await questTraveller(HOUR_MS);

            await expect(
                completion.complete(
                    identityOf(id, {
                        startTime: new Date(START.getTime() + 1),
                    }),
                ),
            ).resolves.toBe('stale');

            expect(questQueue.added).toEqual([]);
        });

        it('enqueues nothing when the countdown had already started', async () => {
            const pending = await persistPendingQuest(STARTED_AT);
            const id = await ownedTraveller(new Types.ObjectId(), {
                travel: { kind: 'quest' },
                character: {
                    quests: { completedQuests: [], pendingQuest: pending._id },
                },
            });

            await completion.complete(identityOf(id));

            expect(questQueue.added).toEqual([]);
        });

        it('completes the travel when the resolution queue is unavailable', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation();
            questQueue.failAdd = true;
            const { id, pqId } = await questTraveller(HOUR_MS);

            await expect(completion.complete(identityOf(id))).resolves.toBe(
                'completed',
            );

            expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
            const quest = await pendingQuests.collection.findOne({ _id: pqId });
            expect(quest?.startDate).toEqual(END);
            expect(warn).toHaveBeenCalledWith(
                `Accodamento della risoluzione quest-${pqId.toHexString()}-${END.getTime()} fallito: lo risolverà lo sweep`,
            );
            warn.mockRestore();
        });

        describe('party start at the arrival (utente 2026-10-25)', () => {
            const LATER_END = new Date(NOW.getTime() + HOUR_MS);

            // boss a 2 posti: il viaggiatore arriva ora, l'altro registrato è sul marker (arrivedAt) o ancora in viaggio (null)
            async function bossParty(otherArrivedAt: Date | null) {
                const quest = await persistQuest(quests, {
                    infos: { ...buildQuest().infos, type: 'boss' },
                    requirements: {
                        ...buildQuest().requirements,
                        requiredAdventurers: [{ title: null, count: 2 }],
                    },
                });
                const questId = quest._id as Types.ObjectId;
                const otherPq = await pendingQuests.create({
                    startDate: null,
                    arrivedAt: otherArrivedAt,
                    waitingTime: HOUR_MS,
                    pointsSpent: 0,
                    quest: questId,
                });
                const travellerPq = await persistPendingQuest(
                    null,
                    HOUR_MS,
                    questId,
                );
                const other = await ownedTraveller(new Types.ObjectId(), {
                    travel: {
                        kind: 'quest',
                        endTime: LATER_END,
                        duration: LATER_END.getTime() - START.getTime(),
                    },
                    character: {
                        quests: {
                            completedQuests: [],
                            pendingQuest: otherPq._id,
                        },
                    },
                });
                if (otherArrivedAt)
                    await characters.collection.updateOne(
                        { _id: other },
                        { $set: { 'status.activeTravel': null } },
                    );
                const traveller = await ownedTraveller(new Types.ObjectId(), {
                    travel: { kind: 'quest' },
                    character: {
                        quests: {
                            completedQuests: [],
                            pendingQuest: travellerPq._id,
                        },
                    },
                });
                await quests.updateOne(
                    { _id: questId },
                    {
                        $push: {
                            registeredAdventurers: {
                                $each: [
                                    { character: other, title: 'rookie' },
                                    { character: traveller, title: 'rookie' },
                                ],
                            },
                        },
                    },
                );
                return { questId, otherPq, travellerPq, traveller };
            }

            it('starts the whole party at the arrival of the last member', async () => {
                const { questId, otherPq, travellerPq, traveller } =
                    await bossParty(START);

                await expect(
                    completion.complete(identityOf(traveller)),
                ).resolves.toBe('completed');

                const other = await pendingQuests.collection.findOne({
                    _id: otherPq._id,
                });
                const arrived = await pendingQuests.collection.findOne({
                    _id: travellerPq._id,
                });
                expect(arrived?.arrivedAt).toEqual(END);
                expect(arrived?.startDate).toEqual(END);
                expect(other?.startDate).toEqual(END);
                expect(
                    (await quests.collection.findOne({ _id: questId }))
                        ?.startedAt,
                ).toEqual(END);
                expect(
                    questQueue.added.map(({ data }) => (data as any).startDate),
                ).toEqual([END.getTime(), END.getTime()]);
            });

            it('marks the arrival and waits while another member is travelling', async () => {
                const { travellerPq, traveller } = await bossParty(null);

                await completion.complete(identityOf(traveller));

                const arrived = await pendingQuests.collection.findOne({
                    _id: travellerPq._id,
                });
                expect(arrived?.arrivedAt).toEqual(END);
                expect(arrived?.startDate).toBeNull();
                expect(questQueue.added).toEqual([]);
            });

            it('completes the travel when the start fails after the commit', async () => {
                const error = jest
                    .spyOn(Logger.prototype, 'error')
                    .mockImplementation();
                const { questId, travellerPq, traveller } =
                    await bossParty(START);
                const findById = jest
                    .spyOn(quests, 'findById')
                    .mockImplementationOnce(() => {
                        throw Object.assign(new Error('raw driver message'), {
                            code: 112,
                        });
                    });

                await expect(
                    completion.complete(identityOf(traveller)),
                ).resolves.toBe('completed');

                expect(
                    (await rawCharacter(traveller))?.status.activeTravel,
                ).toBeNull();
                const arrived = await pendingQuests.collection.findOne({
                    _id: travellerPq._id,
                });
                expect(arrived?.arrivedAt).toEqual(END);
                expect(arrived?.startDate).toBeNull();
                expect(questQueue.added).toEqual([]);
                const messages = error.mock.calls.map(([value]) =>
                    String(value),
                );
                expect(messages).toEqual([
                    expect.stringContaining(questId.toHexString()),
                ]);
                expect(messages[0]).toContain('code 112');
                expect(messages[0]).not.toContain('raw driver message');
                findById.mockRestore();
                error.mockRestore();
            });

            it('completes the travel without countdown, job or push after the party was disbanded', async () => {
                const destination = new Types.ObjectId();
                const id = await ownedTraveller(destination, {
                    travel: { kind: 'quest' },
                    character: {
                        quests: { completedQuests: [], pendingQuest: null },
                    },
                });

                await expect(completion.complete(identityOf(id))).resolves.toBe(
                    'completed',
                );

                const character = await rawCharacter(id);
                expect(character?.status.activeTravel).toBeNull();
                expect(character?.status.location).toEqual(destination);
                expect(questQueue.added).toEqual([]);
                expect(push.sent).toEqual([]);
            });

            it('completes the travel without a job when the pending quest is gone', async () => {
                const destination = new Types.ObjectId();
                const id = await ownedTraveller(destination, {
                    travel: { kind: 'quest' },
                    character: {
                        quests: {
                            completedQuests: [],
                            pendingQuest: new Types.ObjectId(),
                        },
                    },
                });

                await expect(completion.complete(identityOf(id))).resolves.toBe(
                    'completed',
                );

                const character = await rawCharacter(id);
                expect(character?.status.activeTravel).toBeNull();
                expect(character?.status.location).toEqual(destination);
                expect(questQueue.added).toEqual([]);
                expect(push.sent).toEqual([]);
            });

            it('completes the travel without a job when the quest is gone', async () => {
                const warn = jest
                    .spyOn(Logger.prototype, 'warn')
                    .mockImplementation();
                const missingQuest = new Types.ObjectId();
                const pending = await persistPendingQuest(
                    null,
                    HOUR_MS,
                    missingQuest,
                );
                const id = await ownedTraveller(new Types.ObjectId(), {
                    travel: { kind: 'quest' },
                    character: {
                        quests: {
                            completedQuests: [],
                            pendingQuest: pending._id,
                        },
                    },
                });

                await expect(completion.complete(identityOf(id))).resolves.toBe(
                    'completed',
                );

                expect(
                    (await rawCharacter(id))?.status.activeTravel,
                ).toBeNull();
                expect(questQueue.added).toEqual([]);
                expect(warn).toHaveBeenCalledWith(
                    `Missione ${missingQuest.toHexString()} inesistente: nessun avvio`,
                );
                warn.mockRestore();
            });
        });
    });

    describe('sweep and boot reconciler', () => {
        let sweeper: TravelSweeper;

        beforeAll(() => {
            sweeper = harness.app.get(TravelSweeper);
        });

        it('completes every expired travel and leaves the others', async () => {
            const firstDestination = new Types.ObjectId();
            const secondDestination = new Types.ObjectId();
            const endTime = new Date(NOW.getTime() + HOUR_MS);
            const expired = await orphanTraveller(firstDestination);
            const future = await orphanTraveller(secondDestination, {
                endTime,
                duration: endTime.getTime() - START.getTime(),
            });
            const before = await rawCharacter(future);

            await expect(sweeper.sweep()).resolves.toBe(1);

            expect((await rawCharacter(expired))?.status).toMatchObject({
                location: firstDestination,
                activeTravel: null,
            });
            expect(await rawCharacter(future)).toEqual(before);

            clock.advanceSeconds(HOUR_MS / 1000);
            try {
                await expect(sweeper.sweep()).resolves.toBe(1);
            } finally {
                clock.advanceSeconds(-HOUR_MS / 1000);
            }
            expect((await rawCharacter(future))?.status).toMatchObject({
                location: secondDestination,
                activeTravel: null,
            });
        });

        it('covers a lost job', async () => {
            const destination = new Types.ObjectId();
            const id = await ownedTraveller(destination);

            await expect(sweeper.sweep()).resolves.toBe(1);

            expect((await rawCharacter(id))?.status.location).toEqual(
                destination,
            );
            expect(push.sent).toEqual([
                { tokens: ['tok-1'], message: travelEnd(id.toHexString()) },
            ]);
        });

        it('pushes once when the sweep races a job trigger', async () => {
            const id = await ownedTraveller(new Types.ObjectId());

            await Promise.all([
                sweeper.sweep(),
                completion.complete(identityOf(id)),
            ]);

            expect((await rawCharacter(id))?.status.activeTravel).toBeNull();
            expect(push.sent).toHaveLength(1);
        });

        it(
            'completes an expired travel at boot',
            async () => {
                const destination = new Types.ObjectId();
                const id = await orphanTraveller(destination);

                const second = await createAuthTestApp({
                    clock,
                    imports: [TravelModule],
                    overrides,
                });
                try {
                    const deadline = Date.now() + BOOT_DEADLINE_MS;
                    let raw = await rawCharacter(id);
                    while (raw?.status.activeTravel && Date.now() < deadline) {
                        await pause(POLL_STEP_MS);
                        raw = await rawCharacter(id);
                    }
                    expect(raw?.status.activeTravel).toBeNull();
                    expect(raw?.status.location).toEqual(destination);
                } finally {
                    // solo l'app: second.close() cancellerebbe il DB condiviso
                    await second.app.close();
                }
            },
            BOOT_TEST_TIMEOUT_MS,
        );
    });
});
