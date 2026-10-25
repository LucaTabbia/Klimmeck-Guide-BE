import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer } from '../../../test/authz/player-fixture';
import { buildQuest, persistEnemy } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const LATER_START = new Date(OUTCOME_START.getTime() + 60 * 60 * 1000);
const BOSS_TITLE = 'Il drago del passo';
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};
const THREE_SEATS = [{ title: null, count: 3 }];

describe('QuestResolutionService.resolveStandard for a boss group (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let warn: jest.SpyInstance;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance, combat: scripted });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
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

    async function bossQuest() {
        const foe = (await persistEnemy(world.models.enemies, {
            xp: 100,
        })) as { _id: Types.ObjectId };
        return {
            infos: {
                ...buildQuest().infos,
                type: 'boss',
                title: BOSS_TITLE,
                enemy: foe._id,
            },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: THREE_SEATS,
            },
            prizes: { ...buildQuest().prizes, xpPrize: 50 },
        };
    }

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-boss-${seq}`,
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: {
                    ...FRESH_STATUS,
                    ...options.characterOverrides?.status,
                },
            },
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    // A crea la quest del boss, B si registra sulla stessa
    async function group(
        bOptions: Partial<QuesterOptions> = {},
    ): Promise<{ a: Quester; b: Quester }> {
        const a = await quester({ questOverrides: await bossQuest() });
        const b = await quester({ quest: a.quest, ...bOptions });
        return { a, b };
    }

    const triggerOf = (subject: Quester) => ({
        pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
        startDate: subject.pendingQuest.startDate ?? OUTCOME_START,
    });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const questOf = (id: unknown) =>
        world.models.quests.findById(id).lean<any>();

    const seatsOf = (quest: any) =>
        (quest.registeredAdventurers ?? []).map((seat: any) =>
            String(seat.character),
        );

    const aids = () =>
        world.models.quests.find({ 'infos.type': 'aid' }).lean<any[]>();

    const questEndPushes = () =>
        world.push.sent.filter(
            ({ message }) => message.type === PushEventType.questEnd,
        );

    async function expectNothingWritten(a: Quester, b: Quester) {
        expect(await world.models.questResults.countDocuments()).toBe(0);
        expect(
            await world.models.pendingQuests.countDocuments({
                _id: { $in: [a.pendingQuest._id, b.pendingQuest._id] },
            }),
        ).toBe(2);
        const quest = await questOf(a.quest._id);
        expect(quest.concludedAt).toBeNull();
        expect(seatsOf(quest)).toEqual([
            String(a.characterId),
            String(b.characterId),
        ]);
        expect(scripted.contexts).toHaveLength(0);
        expect(world.push.sent).toHaveLength(0);
    }

    it('waits while a registered adventurer is still in the countdown', async () => {
        const { a, b } = await group({ startDate: LATER_START });

        await expect(service.resolveStandard(triggerOf(a))).resolves.toBe(
            'waiting',
        );

        await expectNothingWritten(a, b);
    });

    it('waits while a registered adventurer is still travelling', async () => {
        const { a, b } = await group({ startDate: null });

        await expect(service.resolveStandard(triggerOf(a))).resolves.toBe(
            'waiting',
        );

        await expectNothingWritten(a, b);
    });

    it('resolves the whole group once everyone is due, one result each', async () => {
        const { a, b } = await group({ startDate: LATER_START });
        scripted
            .willEnd('success')
            .willResolve(a.characterId, { hpAfter: 800 })
            .willResolve(b.characterId, { hpAfter: 1 });
        clock.advanceSeconds(60 * 60);
        try {
            await expect(service.resolveStandard(triggerOf(b))).resolves.toBe(
                'resolved',
            );
        } finally {
            clock.advanceSeconds(-60 * 60);
        }

        expect(scripted.contexts).toHaveLength(1);
        expect(scripted.contexts[0].participants).toHaveLength(2);
        const results = await world.models.questResults.find().lean<any[]>();
        expect(
            results
                .map((result) => [String(result.character), result.outcome])
                .sort(),
        ).toEqual(
            [
                [String(a.characterId), 'success'],
                [String(b.characterId), 'success'],
            ].sort(),
        );
        const quest = await questOf(a.quest._id);
        expect(quest.concludedAt).toEqual(
            new Date(NOW.getTime() + 60 * 60 * 1000),
        );
        expect(seatsOf(quest)).toEqual([
            String(a.characterId),
            String(b.characterId),
        ]);
        const unharmed = await characterOf(a);
        const wounded = await characterOf(b);
        expect(unharmed.status.currentLifePoints).toBe(800);
        expect(wounded.status.currentLifePoints).toBe(1);
        for (const member of [unharmed, wounded]) {
            expect(member.status.xp).toBe(150);
            expect(member.status.awaitingAid ?? null).toBeNull();
            expect(member.quests.pendingQuest).toBeNull();
            expect(member.quests.completedQuests.map(String)).toContain(
                String(a.quest._id),
            );
        }
        expect(await aids()).toEqual([]);
        expect(await world.models.pendingQuests.countDocuments()).toBe(0);
        expect(questEndPushes()).toHaveLength(2);
        expect(world.questQueue.added).toEqual([]);

        await expect(service.resolveStandard(triggerOf(a))).resolves.toBe(
            'stale',
        );
        expect(await world.models.questResults.countDocuments()).toBe(2);
    });

    it('leaves the boss open when the party loses, one aid for the whole party', async () => {
        const { a, b } = await group();
        scripted.willEnd('failure');

        await expect(service.resolveStandard(triggerOf(a))).resolves.toBe(
            'resolved',
        );

        const quest = await questOf(a.quest._id);
        expect(quest.concludedAt).toBeNull();
        expect(seatsOf(quest)).toEqual([]);
        const created = await aids();
        expect(created).toHaveLength(1);
        const [aid] = created;
        expect(aid.requirements.requiredAdventurers).toEqual([
            { title: null, count: 3 },
        ]);
        expect(aid.rescue.characters.map(String).sort()).toEqual(
            [String(a.characterId), String(b.characterId)].sort(),
        );
        expect(String(aid.rescue.failedQuest)).toBe(String(a.quest._id));
        expect(aid.infos.title).toBe(`Soccorso: ${BOSS_TITLE}`);
        for (const member of [await characterOf(a), await characterOf(b)]) {
            expect(String(member.status.awaitingAid.quest)).toBe(
                String(a.quest._id),
            );
            expect(String(member.status.awaitingAid.aidQuest)).toBe(
                String(aid._id),
            );
        }
        expect(world.questQueue.added).toEqual([
            expect.objectContaining({
                name: 'aid-timeout',
                options: expect.objectContaining({
                    jobId: `aid-${String(aid._id)}`,
                }),
            }),
        ]);
        const results = await world.models.questResults.find().lean<any[]>();
        expect(results.map(({ outcome }) => outcome)).toEqual([
            'failure',
            'failure',
        ]);
        expect(questEndPushes()).toHaveLength(2);
    });

    it('resolves once under concurrent triggers of the group', async () => {
        const { a, b } = await group();

        const outcomes = await Promise.all([
            service.resolveStandard(triggerOf(a)),
            service.resolveStandard(triggerOf(b)),
        ]);

        expect([...outcomes].sort()).toEqual(['resolved', 'stale']);
        expect(await world.models.questResults.countDocuments()).toBe(2);
        expect(questEndPushes()).toHaveLength(2);
    });

    it('drops a registered adventurer without a coherent pending quest', async () => {
        const { a, b } = await group();
        seq += 1;
        const stray = await createPlayer(world.harness, {
            twitchId: `tw-boss-${seq}`,
        });
        const strayId = stray.character!._id as Types.ObjectId;
        await world.models.quests.updateOne(
            { _id: a.quest._id },
            {
                $push: {
                    registeredAdventurers: {
                        character: strayId,
                        title: stray.character!.status.title,
                    },
                },
            },
        );

        await expect(service.resolveStandard(triggerOf(a))).resolves.toBe(
            'resolved',
        );

        const quest = await questOf(a.quest._id);
        expect(seatsOf(quest).sort()).toEqual(
            [String(a.characterId), String(b.characterId)].sort(),
        );
        expect(quest.concludedAt).toEqual(NOW);
        expect(await world.models.questResults.countDocuments()).toBe(2);
        const messages = warn.mock.calls.map(([message]) => String(message));
        expect(
            messages.some(
                (message) =>
                    message.includes(String(strayId)) &&
                    message.includes(String(a.quest._id)),
            ),
        ).toBe(true);
    });

    it('dispatches an individual quest to the individual resolution', async () => {
        const subject = await quester({
            questOverrides: {
                infos: { ...buildQuest().infos, type: 'job' },
                prizes: { ...buildQuest().prizes, xpPrize: 300 },
            },
        });

        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'resolved',
        );

        const results = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        expect(results).toEqual([
            expect.objectContaining({ outcome: 'success', xpGained: 300 }),
        ]);
        expect(scripted.contexts).toHaveLength(0);
        expect(questEndPushes()).toHaveLength(1);
    });
});
