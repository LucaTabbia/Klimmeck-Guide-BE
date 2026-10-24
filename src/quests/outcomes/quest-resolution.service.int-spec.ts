import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistLootItem,
    persistSpell,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { OutcomeWriter, StaleResolution } from './outcome-writer.service';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const COINS_PRIZE = { gold: 0, silver: 1, copper: 50 };
const COINS_PRIZE_COPPER = 150;
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};

describe('QuestResolutionService.resolveIndividual without an enemy (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let writer: OutcomeWriter;
    let warn: jest.SpyInstance;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance });
        service = world.harness.app.get(QuestResolutionService);
        writer = world.harness.app.get(OutcomeWriter);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
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

    async function potion(overrides: Record<string, unknown> = {}) {
        return (await persistLootItem(world.models.lootItems, overrides))
            ._id as Types.ObjectId;
    }

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-outcome-${seq}`,
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

    const jobQuest = (prizes: Record<string, unknown>, type = 'job') => ({
        infos: { ...buildQuest().infos, type, title: 'Lavoro al porto' },
        prizes: { ...buildQuest().prizes, ...prizes },
    });

    const triggerOf = (subject: Quester, startDate = OUTCOME_START) => ({
        pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
        startDate,
    });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const resultsOf = (subject: Quester) =>
        world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();

    const questEndPushes = () =>
        world.push.sent.filter(
            ({ message }) => message.type === PushEventType.questEnd,
        );

    async function expectUntouched(subject: Quester): Promise<void> {
        const character = await characterOf(subject);
        expect(String(character.quests.pendingQuest)).toBe(
            String(subject.pendingQuest._id),
        );
        expect(character.status.xp).toBe(FRESH_STATUS.xp);
        expect(
            await world.models.pendingQuests.exists({
                _id: subject.pendingQuest._id,
            }),
        ).toBeTruthy();
        expect(await resultsOf(subject)).toHaveLength(0);
        expect(world.push.sent).toHaveLength(0);
        expect(world.questQueue.added).toHaveLength(0);
        expect(world.spellQueue.added).toHaveLength(0);
    }

    it('resolves a quest without an enemy as a success with every reward', async () => {
        const item = await potion();
        const subject = await quester({
            questOverrides: jobQuest({
                prizeCoins: COINS_PRIZE,
                xpPrize: 300,
                prizeItem: { itemType: 'LootItem', item, quantity: 2 },
                randomLoot: [],
            }),
        });

        await expect(
            service.resolveIndividual(triggerOf(subject)),
        ).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.quests.pendingQuest).toBeNull();
        expect(character.status).toMatchObject({
            xp: 300,
            level: 2,
            maxLifePoints: 1200,
            currentLifePoints: 1000,
        });
        expect(character.status.coins).toEqual({
            gold: 0,
            silver: 1,
            copper: 50,
        });
        expect(character.assets.ownedItems).toEqual([
            expect.objectContaining({
                itemType: 'LootItem',
                item,
                quantity: 2,
            }),
        ]);
        expect(character.quests.completedQuests.map(String)).toEqual([
            String(subject.quest._id),
        ]);
        expect(
            await world.models.pendingQuests.exists({
                _id: subject.pendingQuest._id,
            }),
        ).toBeNull();
        const [result, ...others] = await resultsOf(subject);
        expect(others).toHaveLength(0);
        expect(result).toMatchObject({
            outcome: 'success',
            xpGained: 300,
            levelAfter: 2,
        });
        expect(String(result.user)).toBe(String(subject.player.user._id));
        expect(result.rewards.items).toEqual([
            expect.objectContaining({
                itemType: 'LootItem',
                item,
                quantity: 2,
            }),
        ]);
        expect(questEndPushes()).toEqual([
            expect.objectContaining({
                message: expect.objectContaining({ id: String(result._id) }),
            }),
        ]);
        expect(world.questQueue.added).toHaveLength(0);
    });

    it('treats an orphan enemy as no enemy and warns with ids only (C6)', async () => {
        const enemyId = new Types.ObjectId();
        const subject = await quester({
            questOverrides: {
                ...jobQuest({ xpPrize: 10 }, 'hunt'),
                infos: {
                    ...buildQuest().infos,
                    type: 'hunt',
                    title: 'Caccia segreta',
                    enemy: enemyId,
                },
            },
        });

        await expect(
            service.resolveIndividual(triggerOf(subject)),
        ).resolves.toBe('resolved');

        const [result] = await resultsOf(subject);
        expect(result).toMatchObject({ outcome: 'success', enemy: null });
        const messages = warn.mock.calls.map(([message]) => String(message));
        const orphan = messages.find((message) =>
            message.includes(enemyId.toHexString()),
        );
        expect(orphan).toContain(String(subject.quest._id));
        expect(orphan).not.toContain('Caccia segreta');
    });

    it('heals every wound and restores the hit points on a heal quest', async () => {
        const subject = await quester({
            questOverrides: jobQuest({}, 'heal'),
            characterOverrides: {
                status: { currentLifePoints: 400, injuries: ['deepCut'] },
            },
        });

        await service.resolveIndividual(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.injuries).toEqual([]);
        expect(character.status.currentLifePoints).toBe(
            character.status.maxLifePoints,
        );
    });

    it('teaches the study spell when the xp after the prize is enough', async () => {
        const spell = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
        });
        const subject = await quester({
            questOverrides: jobQuest(
                { xpPrize: 300, spell: spell._id },
                'study',
            ),
        });

        await service.resolveIndividual(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells.map(String)).toEqual([
            String(spell._id),
        ]);
        const [result] = await resultsOf(subject);
        expect(String(result.spellLearned)).toBe(String(spell._id));
    });

    it('teaches nothing when the xp after the prize is not enough', async () => {
        const spell = await persistSpell(world.models.spells, {
            minXpToLearn: 5000,
        });
        const subject = await quester({
            questOverrides: jobQuest(
                { xpPrize: 300, spell: spell._id },
                'study',
            ),
        });

        await service.resolveIndividual(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells).toEqual([]);
        const [result] = await resultsOf(subject);
        expect(result.spellLearned).toBeNull();
    });

    it('awards the rolled loot', async () => {
        const item = await potion({ rarity: 'common' });
        chance.load([0.1]);
        const subject = await quester({
            questOverrides: jobQuest({
                randomLoot: [{ itemType: 'LootItem', item, quantity: 1 }],
            }),
        });

        await service.resolveIndividual(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.assets.ownedItems).toEqual([
            expect.objectContaining({ item, quantity: 1 }),
        ]);
        const [result] = await resultsOf(subject);
        expect(result.rewards.items).toEqual([
            expect.objectContaining({ item, quantity: 1 }),
        ]);
    });

    it('turns a duplicate trigger into a no-op', async () => {
        const subject = await quester({
            questOverrides: jobQuest({ prizeCoins: COINS_PRIZE }),
        });

        await service.resolveIndividual(triggerOf(subject));
        await expect(
            service.resolveIndividual(triggerOf(subject)),
        ).resolves.toBe('stale');

        expect(await resultsOf(subject)).toHaveLength(1);
        expect(questEndPushes()).toHaveLength(1);
    });

    it('resolves once under concurrent triggers', async () => {
        const subject = await quester({
            questOverrides: jobQuest({ prizeCoins: COINS_PRIZE }),
        });

        const outcomes = await Promise.all([
            service.resolveIndividual(triggerOf(subject)),
            service.resolveIndividual(triggerOf(subject)),
        ]);

        expect([...outcomes].sort()).toEqual(['resolved', 'stale']);
        expect(await resultsOf(subject)).toHaveLength(1);
        expect(questEndPushes()).toHaveLength(1);
        const character = await characterOf(subject);
        expect(
            character.status.coins.silver * 100 + character.status.coins.copper,
        ).toBe(COINS_PRIZE_COPPER);
    });

    it('waits when the countdown has not expired yet', async () => {
        const subject = await quester({ questOverrides: jobQuest({}) });
        clock.advanceSeconds(-60);
        try {
            await expect(
                service.resolveIndividual(triggerOf(subject)),
            ).resolves.toBe('waiting');
        } finally {
            clock.advanceSeconds(60);
        }

        await expectUntouched(subject);
    });

    it('ignores a trigger whose start date no longer matches', async () => {
        const subject = await quester({ questOverrides: jobQuest({}) });

        await expect(
            service.resolveIndividual(
                triggerOf(subject, new Date(OUTCOME_START.getTime() + 1000)),
            ),
        ).resolves.toBe('stale');

        await expectUntouched(subject);
    });

    it('ignores a pending quest whose countdown has not started', async () => {
        const subject = await quester({
            questOverrides: jobQuest({}),
            startDate: null,
        });

        await expect(
            service.resolveIndividual(triggerOf(subject)),
        ).resolves.toBe('stale');

        await expectUntouched(subject);
    });

    it('ignores an archived character', async () => {
        const subject = await quester({ questOverrides: jobQuest({}) });
        await world.models.characters.updateOne(
            { _id: subject.characterId },
            { $set: { deletedAt: ARCHIVED_AT, deletionReason: 'voluntary' } },
        );

        await expect(
            service.resolveIndividual(triggerOf(subject)),
        ).resolves.toBe('stale');

        await expectUntouched(subject);
    });

    it('ignores a missing pending quest', async () => {
        await expect(
            service.resolveIndividual({
                pendingQuestId: new Types.ObjectId(),
                startDate: OUTCOME_START,
            }),
        ).resolves.toBe('stale');

        expect(world.push.sent).toHaveLength(0);
    });

    it('delivers once, after the result is committed', async () => {
        const subject = await quester({ questOverrides: jobQuest({}) });
        const original = writer.deliver.bind(writer);
        const committedBefore: unknown[] = [];
        const deliver = jest
            .spyOn(writer, 'deliver')
            .mockImplementation(async (committed) => {
                committedBefore.push(
                    await world.models.questResults.exists({
                        _id: committed.results[0].resultId,
                    }),
                );
                await original(committed);
            });

        await service.resolveIndividual(triggerOf(subject));

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(committedBefore).toEqual([expect.anything()]);
        expect(committedBefore[0]).toBeTruthy();
    });

    it('delivers nothing when the transaction aborts', async () => {
        const subject = await quester({
            questOverrides: jobQuest({ prizeCoins: COINS_PRIZE }),
        });
        jest.spyOn(writer, 'writeParticipant').mockRejectedValueOnce(
            new StaleResolution(),
        );
        const deliver = jest.spyOn(writer, 'deliver');

        await expect(
            service.resolveIndividual(triggerOf(subject)),
        ).resolves.toBe('stale');

        expect(deliver).not.toHaveBeenCalled();
        await expectUntouched(subject);
    });
});
