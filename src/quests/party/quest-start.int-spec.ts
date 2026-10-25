import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_WAITING_TIME_MS,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { PartyModule } from './party.module';
import { QuestStartService } from './quest-start.service';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const TEN = new Date('2026-10-25T10:00:00.000Z');
const TEN_THIRTY = new Date('2026-10-25T10:30:00.000Z');

describe('QuestStartService.tryStart (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestStartService;
    let warn: jest.SpyInstance;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            imports: [PartyModule],
        });
        service = world.harness.app.get(QuestStartService);
    });

    beforeEach(async () => {
        await world.reset();
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const questOf = (type: string, seats: number) => ({
        infos: { ...buildQuest().infos, type },
        requirements: {
            ...buildQuest().requirements,
            requiredAdventurers: [{ title: null, count: seats }],
        },
    });

    async function quester(options: Partial<QuesterOptions>): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-start-${seq}`,
            startDate: null,
            ...options,
        });
    }

    // A crea la quest registrata, B si registra sulla stessa
    async function pair(
        type: string,
        seats: number,
        arrivals: [Date | null, Date | null],
    ): Promise<{ a: Quester; b: Quester }> {
        const a = await quester({
            questOverrides: questOf(type, seats),
            arrivedAt: arrivals[0],
        });
        const b = await quester({ quest: a.quest, arrivedAt: arrivals[1] });
        return { a, b };
    }

    const pendingQuestOf = (subject: Quester) =>
        world.models.pendingQuests
            .findById(subject.pendingQuest._id)
            .lean<any>();

    const questById = (id: unknown) =>
        world.models.quests.findById(id).lean<any>();

    const resolveJobs = () =>
        world.questQueue.added.filter(({ name }) => name === 'resolve');

    const triggerOf = (subject: Quester) => ({
        questId: subject.quest._id as Types.ObjectId,
        pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
    });

    it('starts an unregistered quest at the arrival', async () => {
        const solo = await quester({
            questOverrides: questOf('job', 1),
            arrivedAt: TEN,
        });

        await expect(service.tryStart(triggerOf(solo))).resolves.toBe(
            'started',
        );

        const pendingQuest = await pendingQuestOf(solo);
        expect(pendingQuest.startDate).toEqual(TEN);
        expect(pendingQuest.arrivedAt).toEqual(TEN);
        expect(resolveJobs()).toEqual([
            expect.objectContaining({
                data: {
                    pendingQuestId: solo.pendingQuest._id.toHexString(),
                    startDate: TEN.getTime(),
                    waitingTime: OUTCOME_WAITING_TIME_MS,
                },
            }),
        ]);
    });

    it('waits while the seats of a boss are still open', async () => {
        const a = await quester({
            questOverrides: questOf('boss', 2),
            arrivedAt: TEN,
        });

        await expect(service.tryStart(triggerOf(a))).resolves.toBe('waiting');

        expect((await pendingQuestOf(a)).startDate).toBeNull();
        expect((await questById(a.quest._id)).startedAt).toBeNull();
        expect(world.questQueue.added).toEqual([]);
    });

    it('waits while a member of a full party is still travelling', async () => {
        const { a, b } = await pair('boss', 2, [TEN, null]);

        await expect(service.tryStart(triggerOf(a))).resolves.toBe('waiting');

        expect((await pendingQuestOf(a)).startDate).toBeNull();
        expect((await pendingQuestOf(b)).startDate).toBeNull();
        expect((await questById(a.quest._id)).startedAt).toBeNull();
        expect(world.questQueue.added).toEqual([]);
    });

    it('starts the whole party at the latest arrival, once', async () => {
        const { a, b } = await pair('boss', 2, [TEN, TEN_THIRTY]);

        await expect(service.tryStart(triggerOf(b))).resolves.toBe('started');

        expect((await pendingQuestOf(a)).startDate).toEqual(TEN_THIRTY);
        expect((await pendingQuestOf(b)).startDate).toEqual(TEN_THIRTY);
        expect((await questById(a.quest._id)).startedAt).toEqual(TEN_THIRTY);
        expect(
            resolveJobs()
                .map(({ data }) => (data as any).pendingQuestId)
                .sort(),
        ).toEqual(
            [
                a.pendingQuest._id.toHexString(),
                b.pendingQuest._id.toHexString(),
            ].sort(),
        );
        expect(
            resolveJobs().every(
                ({ data }) => (data as any).startDate === TEN_THIRTY.getTime(),
            ),
        ).toBe(true);

        await expect(service.tryStart(triggerOf(a))).resolves.toBe('stale');
        expect(resolveJobs()).toHaveLength(2);
    });

    it('starts the party only once under concurrent triggers', async () => {
        const { a, b } = await pair('boss', 2, [TEN, TEN_THIRTY]);

        const outcomes = await Promise.all([
            service.tryStart(triggerOf(a)),
            service.tryStart(triggerOf(b)),
        ]);

        expect(outcomes.sort()).toEqual(['stale', 'started']);
        expect(resolveJobs()).toHaveLength(2);
    });

    it('ignores a concluded, an already started or a missing quest', async () => {
        const concluded = await quester({
            questOverrides: { ...questOf('boss', 1), concludedAt: NOW },
            arrivedAt: TEN,
        });
        const started = await quester({
            questOverrides: { ...questOf('boss', 1), startedAt: TEN },
            arrivedAt: TEN,
        });
        const missingId = new Types.ObjectId();

        await expect(service.tryStart(triggerOf(concluded))).resolves.toBe(
            'stale',
        );
        await expect(service.tryStart(triggerOf(started))).resolves.toBe(
            'stale',
        );
        await expect(service.tryStart({ questId: missingId })).resolves.toBe(
            'stale',
        );

        expect(world.questQueue.added).toEqual([]);
        expect((await pendingQuestOf(started)).startDate).toBeNull();
        const missingWarns = warn.mock.calls
            .map(([message]) => String(message))
            .filter((message) => message.includes(missingId.toHexString()));
        expect(missingWarns).toHaveLength(1);
    });

    it('drops a registered member without a coherent pending quest, then starts with a new member', async () => {
        const { a, b } = await pair('boss', 2, [TEN, TEN]);
        await world.models.pendingQuests.deleteOne({ _id: b.pendingQuest._id });
        const questId = a.quest._id as Types.ObjectId;
        const droppedWarns = () =>
            warn.mock.calls
                .map(([message]) => String(message))
                .filter((message) =>
                    message.includes(b.characterId.toHexString()),
                );

        await expect(service.tryStart(triggerOf(a))).resolves.toBe('waiting');

        const quest = await questById(questId);
        expect(quest.startedAt).toBeNull();
        expect(
            quest.registeredAdventurers.map(({ character }) =>
                String(character),
            ),
        ).toEqual([a.characterId.toHexString()]);
        expect((await pendingQuestOf(a)).startDate).toBeNull();
        expect(world.questQueue.added).toEqual([]);
        expect(droppedWarns()).toEqual([
            `Missione ${questId.toHexString()}: registrati senza una missione in attesa coerente (${b.characterId.toHexString()}) rimossi dal party`,
        ]);

        await expect(service.tryStart(triggerOf(a))).resolves.toBe('waiting');
        expect(droppedWarns()).toHaveLength(1);

        const c = await quester({ quest: a.quest, arrivedAt: TEN_THIRTY });
        await expect(service.tryStart(triggerOf(c))).resolves.toBe('started');

        expect((await questById(questId)).startedAt).toEqual(TEN_THIRTY);
        expect((await pendingQuestOf(a)).startDate).toEqual(TEN_THIRTY);
        expect((await pendingQuestOf(c)).startDate).toEqual(TEN_THIRTY);
        expect(resolveJobs()).toHaveLength(2);
    });

    it('starts a single seat enemy at the arrival', async () => {
        const solo = await quester({
            questOverrides: questOf('enemy', 1),
            arrivedAt: TEN,
        });

        await expect(service.tryStart(triggerOf(solo))).resolves.toBe(
            'started',
        );

        expect((await pendingQuestOf(solo)).startDate).toEqual(TEN);
        expect((await questById(solo.quest._id)).startedAt).toEqual(TEN);
        expect(resolveJobs()).toHaveLength(1);
    });
});
