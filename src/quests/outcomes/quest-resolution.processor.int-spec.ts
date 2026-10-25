import { BullModule, getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { Types } from 'mongoose';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { PUSH_CONFIG } from 'src/config/push-config';
import { PushTransport } from 'src/push/transport/push-transport';
import {
    type AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { createPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, buildQuest } from '../../../test/fixtures';
import { FakePushTransport } from '../../../test/push/fake-push-transport';
import {
    initOutcomeCollections,
    type OutcomeModels,
    outcomeModels,
    persistQuester,
    type Quester,
    QUIET_OUTCOME_OVERRIDES,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { startRedis, stopRedis } from '../../../test/setup/redis';
import { AID_TIMEOUT_MS } from './aid/aid-timeout';
import { buildAidQuest } from './aid/aid-quest';
import { ChanceSource } from './chance-source';
import { CombatResolver } from './combat/combat-resolver';
import { QuestOutcomesModule } from './quest-outcomes.module';
import {
    AID_TIMEOUT_JOB,
    PARTY_TIMEOUT_JOB,
    partyTimeoutJobId,
    QUEST_RESOLUTION_QUEUE,
    questResolutionJobId,
    RESOLVE_QUEST_JOB,
} from './scheduling/quest-resolution-job';
import { QuestResolutionScheduler } from './scheduling/quest-resolution.scheduler';

const WAIT_DEADLINE_MS = 10_000;
const POLL_STEP_MS = 100;
const NEGATIVE_WAIT_MS = 1_000;
const TEST_TIMEOUT_MS = 30_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// polling con deadline, mai la promessa di fine job di Bull (open handle, Phase 1 D-06)
async function waitFor(
    predicate: () => Promise<boolean> | boolean,
    timeoutMs = WAIT_DEADLINE_MS,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await pause(POLL_STEP_MS);
    }
    return predicate();
}

/**
 * INTEGRATION: i job 'resolve' e 'aid-timeout' della coda 'quest-resolution' su Redis effimero REALE e replSet.
 * SystemClock reale (il delay Bull usa il tempo reale); nessun modulo con change stream.
 */
describe('QuestResolutionProcessor (real Redis)', () => {
    let harness: AuthTestApp;
    let models: OutcomeModels;
    let queue: Queue;
    let scheduler: QuestResolutionScheduler;
    let seq = 0;
    const push = new FakePushTransport();
    const combat = new ScriptedCombatResolver();
    const chance = new SequenceChance();

    beforeAll(async () => {
        const { host, port } = await startRedis();
        harness = await createAuthTestApp({
            imports: [
                BullModule.forRoot({ redis: { host, port } }),
                QuestOutcomesModule,
            ],
            overrides: [
                ...QUIET_OUTCOME_OVERRIDES,
                { token: PushTransport, useValue: push },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: CombatResolver, useValue: combat },
                { token: ChanceSource, useValue: chance },
            ],
        });
        models = outcomeModels(harness);
        await initOutcomeCollections(harness, models);
        queue = harness.app.get<Queue>(getQueueToken(QUEST_RESOLUTION_QUEUE));
        scheduler = harness.app.get(QuestResolutionScheduler);
    }, 120_000);

    beforeEach(() => {
        push.reset();
        combat.reset();
        chance.load([]);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        // Redis condiviso in CI (Pitfall 6): nessun job residuo per le suite successive
        if (queue) await queue.empty();
        if (harness) {
            await harness.app
                .get<Queue>(getQueueToken(SPELL_RECOVERY_QUEUE))
                .empty();
            await harness.close();
        }
        await stopRedis();
    });

    // corsia standard di tipo job: nessun nemico, successo deterministico
    async function quester(startDate: Date, waitingTime: number) {
        seq += 1;
        const created = await persistQuester(harness, {
            twitchId: `tw-processor-${seq}`,
            questOverrides: {
                infos: { ...buildQuest().infos, type: 'job' },
                prizes: { ...buildQuest().prizes, randomLoot: [] },
            },
            startDate,
            waitingTime,
        });
        await registerDevice(harness, created.player);
        return created;
    }

    const pendingQuestExists = async ({ pendingQuest }: Quester) =>
        (await models.pendingQuests.exists({ _id: pendingQuest._id })) !== null;

    const resultsOf = (characterId: Types.ObjectId) =>
        models.questResults.find({ character: characterId }).lean<any[]>();

    const logged = (spy: jest.SpyInstance, message: string) =>
        spy.mock.calls.some(([value]) => value === message);

    it(
        'resolves a due standard quest when the job fires',
        async () => {
            const subject = await quester(
                new Date(Date.now() - HOUR_MS),
                MINUTE_MS,
            );

            await scheduler.scheduleResolution({
                pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
                startDate: subject.pendingQuest.startDate as Date,
                waitingTime: MINUTE_MS,
            });

            expect(
                await waitFor(async () => !(await pendingQuestExists(subject))),
            ).toBe(true);
            expect(
                await waitFor(
                    async () =>
                        (await resultsOf(subject.characterId)).length === 1,
                ),
            ).toBe(true);
            expect(await resultsOf(subject.characterId)).toEqual([
                expect.objectContaining({ outcome: 'success' }),
            ]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'ignores malformed job data',
        async () => {
            const warn = jest.spyOn(Logger.prototype, 'warn');
            const control = await quester(
                new Date(Date.now() - HOUR_MS),
                MINUTE_MS,
            );

            const job = await queue.add(RESOLVE_QUEST_JOB, {
                pendingQuestId: 'x',
            });
            const message = `Job di risoluzione ${String(job.id)} malformato: ignorato`;

            expect(await waitFor(() => logged(warn, message))).toBe(true);
            // asserzione negativa: nessun evento da attendere, solo una finestra fissa
            await pause(NEGATIVE_WAIT_MS);
            expect(await pendingQuestExists(control)).toBe(true);
            expect(await resultsOf(control.characterId)).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'leaves an early job to the sweep without requeueing it',
        async () => {
            const log = jest.spyOn(Logger.prototype, 'log');
            const startDate = new Date();
            const subject = await quester(startDate, MINUTE_MS);
            const pendingQuestId = subject.pendingQuest._id as Types.ObjectId;
            const jobId = questResolutionJobId(pendingQuestId, startDate);
            const message = `Job di risoluzione ${jobId} in anticipo: lo risolverà lo sweep`;

            await queue.add(
                RESOLVE_QUEST_JOB,
                {
                    pendingQuestId: pendingQuestId.toHexString(),
                    startDate: startDate.getTime(),
                    waitingTime: MINUTE_MS,
                },
                { jobId, delay: 0 },
            );

            expect(await waitFor(() => logged(log, message))).toBe(true);
            // asserzione negativa: il processor ha già risposto, la finestra esclude scritture tardive
            await pause(NEGATIVE_WAIT_MS);
            expect(await pendingQuestExists(subject)).toBe(true);
            expect(await resultsOf(subject.characterId)).toEqual([]);
            // mai ri-accodato (C10 Phase 8)
            expect(await queue.getDelayed()).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'kills the injured when the rescue timeout job fires',
        async () => {
            seq += 1;
            const since = new Date(Date.now() - 8 * DAY_MS);
            const original = await models.quests.create(
                buildQuest({
                    infos: { ...buildQuest().infos, type: 'enemy' },
                }),
            );
            const aidId = new Types.ObjectId();
            const injured = await createPlayer(harness, {
                twitchId: `tw-processor-${seq}`,
                characterOverrides: {
                    status: {
                        ...buildCharacter().status,
                        awaitingAid: {
                            quest: original._id,
                            aidQuest: aidId,
                            since,
                        },
                    },
                },
            });
            const injuredId = injured.character!._id as Types.ObjectId;
            await models.quests.create(
                buildAidQuest(original.toObject() as never, [injuredId], aidId),
            );
            expect(since.getTime() + AID_TIMEOUT_MS).toBeLessThan(Date.now());

            await queue.add(AID_TIMEOUT_JOB, {
                aidQuestId: aidId.toHexString(),
                since: since.getTime(),
            });

            expect(
                await waitFor(
                    async () =>
                        (
                            await models.characters
                                .findById(injuredId)
                                .lean<any>()
                        )?.deletionReason === 'death',
                ),
            ).toBe(true);
            expect(
                await waitFor(
                    async () => (await resultsOf(injuredId)).length === 1,
                ),
            ).toBe(true);
            expect(await resultsOf(injuredId)).toEqual([
                expect.objectContaining({ outcome: 'death' }),
            ]);
        },
        TEST_TIMEOUT_MS,
    );

    // boss a 2 posti con un solo registrato sul marker, registrato a `since`
    async function formingParty(since: Date) {
        seq += 1;
        const created = await persistQuester(harness, {
            twitchId: `tw-processor-${seq}`,
            questOverrides: {
                infos: { ...buildQuest().infos, type: 'boss' },
                requirements: {
                    ...buildQuest().requirements,
                    requiredAdventurers: [{ title: null, count: 2 }],
                },
            },
            startDate: null,
            arrivedAt: since,
        });
        await models.quests.updateOne(
            { _id: created.quest._id },
            { $set: { 'registeredAdventurers.$[].registeredAt': since } },
        );
        return created;
    }

    it(
        'disbands an expired party when the party timeout job fires',
        async () => {
            const since = new Date(Date.now() - DAY_MS - HOUR_MS);
            const subject = await formingParty(since);

            await queue.add(PARTY_TIMEOUT_JOB, {
                questId: String(subject.quest._id),
                since: since.getTime(),
            });

            expect(
                await waitFor(async () => !(await pendingQuestExists(subject))),
            ).toBe(true);
            expect(
                (await models.quests.findById(subject.quest._id).lean<any>())
                    .registeredAdventurers,
            ).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'leaves an early party timeout job to the sweep',
        async () => {
            const log = jest.spyOn(Logger.prototype, 'log');
            const since = new Date();
            const subject = await formingParty(since);
            const questId = subject.quest._id as Types.ObjectId;
            const message = `Job di timeout del party ${partyTimeoutJobId(questId, since)} in anticipo: lo risolverà lo sweep`;

            await queue.add(PARTY_TIMEOUT_JOB, {
                questId: questId.toHexString(),
                since: since.getTime(),
            });

            expect(await waitFor(() => logged(log, message))).toBe(true);
            await pause(NEGATIVE_WAIT_MS);
            expect(await pendingQuestExists(subject)).toBe(true);
        },
        TEST_TIMEOUT_MS,
    );
});
