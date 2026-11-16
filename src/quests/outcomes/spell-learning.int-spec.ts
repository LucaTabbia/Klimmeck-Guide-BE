import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { Lore } from 'src/models/lore.model';
import { PushEventType } from 'src/push/push-event-type.enum';
import {
    UNACKNOWLEDGED_RESULTS_SORT,
    unacknowledgedResultsFilterOf,
} from 'src/quests/results/quest-result-acknowledgement';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistLore,
    persistQuest,
    persistSpell,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    OUTCOME_WAITING_TIME_MS,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const LEARN_TIME = 1_800_000;
const LEARNED_AT = new Date(NOW.getTime() + LEARN_TIME);
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
    title: 'mage',
};

describe('QuestResolutionService.resolveStandard at the end of a learning part (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let seq = 0;
    let movedMs = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        clock.advanceSeconds(-movedMs / 1000);
        movedMs = 0;
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const moveTo = (at: Date) => {
        const delta = at.getTime() - clock.now().getTime();
        clock.advanceSeconds(delta / 1000);
        movedMs += delta;
    };

    const arcaneQuest = () => ({
        infos: {
            ...buildQuest().infos,
            type: 'arcane',
            title: 'Scuola arcana',
        },
        prizes: { ...buildQuest().prizes, xpPrize: 300 },
    });

    const drawSpellOn = (questId: Types.ObjectId) =>
        world.models.quests.collection.updateOne(
            { _id: questId },
            { $set: { 'prizes.spellDraw': true } },
        );

    const originLore = async () =>
        (await persistLore(world.harness.connection.model(Lore.name), {
            type: LoreType.knowledge,
            name: 'Arcano',
        })) as { _id: Types.ObjectId };

    const learnable = (relatedLore: Types.ObjectId[]) =>
        persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 4,
            requiredLearnTime: LEARN_TIME,
            relatedLore,
        });

    // la ricerca a NOW: tiri 0, 0 = soglia vinta e prima magia imparabile
    async function researched(): Promise<Quester> {
        seq += 1;
        const subject = await persistQuester(world.harness, {
            twitchId: `tw-spell-learning-${seq}`,
            questOverrides: arcaneQuest(),
            characterOverrides: { status: FRESH_STATUS },
        });
        await drawSpellOn(subject.quest._id);
        chance.load([0, 0]);
        await expect(
            service.resolveStandard({
                pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
                startDate: OUTCOME_START,
            }),
        ).resolves.toBe('resolved');
        return subject;
    }

    const learningTriggerOf = (subject: Quester, startDate: Date = NOW) => ({
        pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
        startDate,
    });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const sheetsOf = (subject: Quester) =>
        world.models.questResults
            .find({ character: subject.characterId })
            .sort({ resolvedAt: 1, _id: 1 })
            .lean<any[]>();

    const questEndIds = () =>
        world.push.sent
            .filter(({ message }) => message.type === PushEventType.questEnd)
            .map(({ message }) => message.id);

    it('completes the learning part at its end: spell known, lore unlocked, lane free (D-26)', async () => {
        const lore = await originLore();
        const spell = await learnable([lore._id]);
        const subject = await researched();
        moveTo(LEARNED_AT);

        await expect(
            service.resolveStandard(learningTriggerOf(subject)),
        ).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([
            { spell: spell._id, usages: 4, recoveries: [], active: false },
        ]);
        expect(character.status.unlockedLore.map(String)).toContain(
            String(lore._id),
        );
        expect(character.quests.pendingQuest).toBeNull();
        expect(
            await world.models.pendingQuests.findById(subject.pendingQuest._id),
        ).toBeNull();
    });

    it('writes a second sheet for the same quest and character with the learned spell and the origin lore (D-31)', async () => {
        const lore = await originLore();
        const spell = await learnable([lore._id]);
        const subject = await researched();
        moveTo(LEARNED_AT);

        await service.resolveStandard(learningTriggerOf(subject));

        const character = await characterOf(subject);
        const [research, learned] = await sheetsOf(subject);
        expect(await world.models.questResults.countDocuments()).toBe(2);
        expect(String(learned.quest.id)).toBe(String(research.quest.id));
        expect(String(research.spellFound)).toBe(String(spell._id));
        expect(research.spellLearned).toBeNull();
        expect(research.loreUnlocked.map(String)).not.toContain(
            String(lore._id),
        );
        expect(research.xpGained).toBe(300);
        expect(String(learned.spellLearned)).toBe(String(spell._id));
        expect(learned.loreUnlocked.map(String)).toEqual([String(lore._id)]);
        expect(learned.xpGained).toBe(0);
        expect(learned.rewards.coins).toEqual({
            gold: 0,
            silver: 0,
            copper: 0,
        });
        expect(learned.xpBefore).toBe(character.status.xp);
        expect(learned.xpAfter).toBe(character.status.xp);
        expect(learned.resolvedAt).toEqual(LEARNED_AT);
        expect(learned.spellFound).toBeNull();
        expect(learned.acknowledgedAt).toBeNull();
    });

    it('lists both sheets of the quest among the unacknowledged results, the research sheet first (D-31)', async () => {
        await learnable([]);
        const subject = await researched();
        moveTo(LEARNED_AT);

        await service.resolveStandard(learningTriggerOf(subject));

        const listed = await world.models.questResults
            .find(
                unacknowledgedResultsFilterOf(
                    subject.player.user._id as Types.ObjectId,
                ),
            )
            .sort(UNACKNOWLEDGED_RESULTS_SORT)
            .lean<any[]>();
        expect(listed).toHaveLength(2);
        expect(listed[0].spellFound).not.toBeNull();
        expect(listed[1].spellLearned).not.toBeNull();
    });

    it('sends the quest end push with the id of the second sheet (D-31)', async () => {
        await learnable([]);
        const subject = await researched();
        await registerDevice(world.harness, subject.player);
        moveTo(LEARNED_AT);

        await service.resolveStandard(learningTriggerOf(subject));

        const [, learned] = await sheetsOf(subject);
        expect(questEndIds()).toEqual([String(learned._id)]);
    });

    it('sends the quest end push of the second sheet at the end of the learning part and no research push (D-29, D-31)', async () => {
        await learnable([]);
        const subject = await researched();
        await registerDevice(world.harness, subject.player);
        moveTo(LEARNED_AT);

        await service.resolveStandard(learningTriggerOf(subject));

        const [research, learned] = await sheetsOf(subject);
        expect(
            world.push.sent.map(({ message }) => ({
                type: message.type,
                id: message.id,
            })),
        ).toEqual([
            {
                type: PushEventType.spellResearchSucceeded,
                id: String(research._id),
            },
            { type: PushEventType.questEnd, id: String(learned._id) },
        ]);
    });

    it('waits before the end of the learning part (D-26)', async () => {
        await learnable([]);
        const subject = await researched();
        moveTo(new Date(LEARNED_AT.getTime() - 60_000));

        await expect(
            service.resolveStandard(learningTriggerOf(subject)),
        ).resolves.toBe('waiting');

        expect((await characterOf(subject)).status.spellStates).toEqual([]);
        expect(await sheetsOf(subject)).toHaveLength(1);
    });

    it('ignores the research trigger once the learning part has started (D-26)', async () => {
        await learnable([]);
        const subject = await researched();
        moveTo(LEARNED_AT);

        await expect(
            service.resolveStandard(learningTriggerOf(subject, OUTCOME_START)),
        ).resolves.toBe('stale');

        expect((await characterOf(subject)).status.spellStates).toEqual([]);
        expect(await sheetsOf(subject)).toHaveLength(1);
    });

    it('completes the learning part once under a repeated trigger (D-26, D-31)', async () => {
        await learnable([]);
        const subject = await researched();
        moveTo(LEARNED_AT);

        await service.resolveStandard(learningTriggerOf(subject));
        await expect(
            service.resolveStandard(learningTriggerOf(subject)),
        ).resolves.toBe('stale');

        expect((await characterOf(subject)).status.spellStates).toHaveLength(1);
        expect(await world.models.questResults.countDocuments()).toBe(2);
    });

    it('completes the learning part of a quest gone from the board (D-26, D-31)', async () => {
        const lore = await originLore();
        const spell = await learnable([lore._id]);
        const subject = await researched();
        await world.models.quests.deleteOne({ _id: subject.quest._id });
        moveTo(LEARNED_AT);

        await expect(
            service.resolveStandard(learningTriggerOf(subject)),
        ).resolves.toBe('resolved');

        const character = await characterOf(subject);
        const [research, learned] = await sheetsOf(subject);
        expect(character.status.spellStates).toHaveLength(1);
        expect(character.quests.pendingQuest).toBeNull();
        expect(String(learned.quest.id)).toBe(String(research.quest.id));
        expect(learned.quest.title).toBe('Scuola arcana');
        expect(String(learned.spellLearned)).toBe(String(spell._id));
    });

    it('writes no second sheet for a spell learned in the meantime (D-26, D-31)', async () => {
        const spell = await learnable([]);
        const subject = await researched();
        await registerDevice(world.harness, subject.player);
        await world.models.characters.collection.updateOne(
            { _id: subject.characterId },
            {
                $set: {
                    'status.spellStates': [
                        {
                            spell: spell._id,
                            usages: 2,
                            recoveries: [],
                            active: false,
                        },
                    ],
                },
            },
        );
        moveTo(LEARNED_AT);

        await expect(
            service.resolveStandard(learningTriggerOf(subject)),
        ).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.status.spellStates).toHaveLength(1);
        expect(character.quests.pendingQuest).toBeNull();
        expect(await sheetsOf(subject)).toHaveLength(1);
        expect(questEndIds()).toEqual([]);
    });

    it('keeps the first origin lore rule across the learning part (D-24, D-31)', async () => {
        const lore = await originLore();
        await learnable([lore._id]);
        await learnable([lore._id]);
        const subject = await researched();
        moveTo(LEARNED_AT);
        await service.resolveStandard(learningTriggerOf(subject));
        const second = await persistQuest(world.models.quests, {
            ...buildQuest(),
            ...arcaneQuest(),
        });
        await drawSpellOn(second._id);
        const pendingQuest = await world.models.pendingQuests.create({
            startDate: OUTCOME_START,
            arrivedAt: OUTCOME_START,
            waitingTime: OUTCOME_WAITING_TIME_MS,
            pointsSpent: 0,
            quest: second._id,
        });
        await world.models.characters.updateOne(
            { _id: subject.characterId },
            { $set: { 'quests.pendingQuest': pendingQuest._id } },
        );
        chance.load([0, 0]);
        await service.resolveStandard({
            pendingQuestId: pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });
        const secondEnd = new Date(LEARNED_AT.getTime() + LEARN_TIME);
        moveTo(secondEnd);

        await expect(
            service.resolveStandard({
                pendingQuestId: pendingQuest._id as Types.ObjectId,
                startDate: LEARNED_AT,
            }),
        ).resolves.toBe('resolved');

        const character = await characterOf(subject);
        const sheets = await sheetsOf(subject);
        expect(character.status.spellStates).toHaveLength(2);
        expect(sheets).toHaveLength(4);
        expect(sheets[3].spellLearned).not.toBeNull();
        expect(sheets[3].loreUnlocked).toEqual([]);
    });

    it('still resolves a quest without a learning part as before (D-26)', async () => {
        seq += 1;
        const subject = await persistQuester(world.harness, {
            twitchId: `tw-spell-learning-${seq}`,
            questOverrides: arcaneQuest(),
            characterOverrides: { status: FRESH_STATUS },
        });

        await expect(
            service.resolveStandard({
                pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
                startDate: OUTCOME_START,
            }),
        ).resolves.toBe('resolved');

        const sheets = await sheetsOf(subject);
        expect(sheets).toHaveLength(1);
        expect(sheets[0].xpGained).toBe(300);
        expect((await characterOf(subject)).quests.pendingQuest).toBeNull();
        expect(
            await world.models.pendingQuests.findById(subject.pendingQuest._id),
        ).toBeNull();
    });
});
