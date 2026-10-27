import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { CompletePendingRequestInput } from 'src/models/request/complete-pending-request.model';
import { PushEventType } from 'src/push/push-event-type.enum';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistEnemy,
    persistLootItem,
    persistSpell,
    spellBook,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GmCompletionService } from './gm-completion.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
// mirror e stato coerenti (D-03): gli usi della magia attiva stanno nella voce di stato
const knowingSpell = (spell: Types.ObjectId, usages: number) => {
    const book = spellBook([{ spell, usages, active: true }]);
    return {
        status: { spells: book.spells, spellStates: book.spellStates },
        assets: { activeSpells: book.activeSpells },
    };
};
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};
const NOT_FOUND = {
    code: 'NOT_FOUND',
    message: 'Missione in attesa non trovata',
};

describe('GmCompletionService.complete (replSet)', () => {
    let world: OutcomeHarness;
    let service: GmCompletionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance });
        service = world.harness.app.get(GmCompletionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-gm-${seq}`,
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

    const gmQuest = (
        type: 'story' | 'worldMission',
        prizes: Record<string, unknown> = {},
        infos: Record<string, unknown> = {},
    ) => ({
        infos: {
            ...buildQuest().infos,
            type,
            title: 'La corte del re',
            ...infos,
        },
        requirements: { ...buildQuest().requirements, minTitle: 'rookie' },
        prizes: { ...buildQuest().prizes, ...prizes },
    });

    const storyQuester = (options: Partial<QuesterOptions> = {}) =>
        quester({
            lane: QuestLane.story,
            questOverrides: gmQuest('story', {
                xpPrize: 400,
                prizeCoins: { gold: 0, silver: 2, copper: 0 },
            }),
            ...options,
        });

    const inputOf = (
        subject: Quester,
        outcomes?: CompletePendingRequestInput['outcomes'],
    ): CompletePendingRequestInput => ({
        pendingQuestId: String(subject.pendingQuest._id),
        ...(outcomes ? { outcomes } : {}),
    });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const resultsOf = (subject: Quester) =>
        world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();

    const pendingQuestExists = async (subject: Quester) =>
        Boolean(
            await world.models.pendingQuests.exists({
                _id: subject.pendingQuest._id,
            }),
        );

    const questEndPushes = () =>
        world.push.sent.filter(
            ({ message }) => message.type === PushEventType.questEnd,
        );

    async function expectUntouched(
        subjects: Quester[],
        lane: QuestLane,
    ): Promise<void> {
        for (const subject of subjects) {
            const character = await characterOf(subject);
            expect(String(character.quests[lane])).toBe(
                String(subject.pendingQuest._id),
            );
            expect(character.status).toMatchObject(FRESH_STATUS);
            expect(await pendingQuestExists(subject)).toBe(true);
            expect(await resultsOf(subject)).toHaveLength(0);
        }
        const quest = await world.models.quests
            .findById(subjects[0].quest._id)
            .lean<any>();
        expect(quest.concludedAt ?? null).toBeNull();
        expect(world.push.sent).toHaveLength(0);
        expect(world.spellQueue.added).toHaveLength(0);
    }

    it('completes a story with the catalog prizes and the next title (D-14)', async () => {
        const subject = await storyQuester();

        const drafts = await service.complete(inputOf(subject));

        expect(drafts).toHaveLength(1);
        const character = await characterOf(subject);
        expect(character.quests.activeStoryQuest).toBeNull();
        expect(character.status.title).toBe('adventurer');
        expect(character.status.xp).toBe(400);
        expect(character.status.currentLifePoints).toBe(1000);
        expect(character.status.injuries).toEqual([]);
        expect(character.status.coins).toEqual({
            gold: 0,
            silver: 2,
            copper: 0,
        });
        expect(character.quests.completedQuests.map(String)).toEqual([
            String(subject.quest._id),
        ]);
        expect(await pendingQuestExists(subject)).toBe(false);
        const [result, ...others] = await resultsOf(subject);
        expect(others).toHaveLength(0);
        expect(String(result._id)).toBe(String(drafts[0]._id));
        expect(result).toMatchObject({
            outcome: QuestOutcome.gmCompleted,
            titleBefore: 'rookie',
            titleAfter: 'adventurer',
            hpBefore: 1000,
            hpAfter: 1000,
            injuriesAdded: [],
            xpGained: 400,
        });
        expect(String(result.user)).toBe(String(subject.player.user._id));
        expect(questEndPushes()).toEqual([
            expect.objectContaining({
                message: expect.objectContaining({ id: String(result._id) }),
            }),
        ]);
    });

    it('closes a world mission for every registered character with one result each (D-04, D-06)', async () => {
        const potion = (await persistLootItem(world.models.lootItems))
            ._id as Types.ObjectId;
        const first = await quester({
            lane: QuestLane.worldMission,
            questOverrides: gmQuest('worldMission', { xpPrize: 100 }),
        });
        const second = await quester({
            lane: QuestLane.worldMission,
            quest: first.quest,
            characterOverrides: {
                assets: {
                    ownedItems: [
                        { itemType: 'LootItem', item: potion, quantity: 2 },
                    ],
                },
            },
        });
        const third = await quester({
            lane: QuestLane.worldMission,
            quest: first.quest,
        });

        const drafts = await service.complete(
            inputOf(third, [
                {
                    characterId: String(first.characterId),
                    hpAfter: 300,
                    injuries: [InjuryType.deepCut],
                },
                {
                    characterId: String(second.characterId),
                    consumablesUsed: [{ item: String(potion), quantity: 1 }],
                },
            ]),
        );

        expect(drafts).toHaveLength(3);
        expect(new Set(drafts.map(({ _id }) => String(_id))).size).toBe(3);
        const [firstResult] = await resultsOf(first);
        expect(firstResult).toMatchObject({
            outcome: QuestOutcome.gmCompleted,
            hpAfter: 300,
            injuriesAdded: [InjuryType.deepCut],
        });
        const [secondResult] = await resultsOf(second);
        expect(secondResult.consumablesUsed).toEqual([
            expect.objectContaining({ item: potion, quantity: 1 }),
        ]);
        const [thirdResult] = await resultsOf(third);
        expect(thirdResult).toMatchObject({
            outcome: QuestOutcome.gmCompleted,
            hpBefore: 1000,
            hpAfter: 1000,
            injuriesAdded: [],
        });
        expect((await characterOf(first)).status).toMatchObject({
            currentLifePoints: 300,
            injuries: [InjuryType.deepCut],
        });
        expect((await characterOf(second)).assets.ownedItems).toEqual([
            expect.objectContaining({ item: potion, quantity: 1 }),
        ]);
        for (const subject of [first, second, third]) {
            const character = await characterOf(subject);
            expect(character.quests.activeWorldMissionQuest).toBeNull();
            expect(await pendingQuestExists(subject)).toBe(false);
        }
        const quest = await world.models.quests
            .findById(first.quest._id)
            .lean<any>();
        expect(quest.concludedAt).toEqual(NOW);
        expect(questEndPushes()).toHaveLength(3);
    });

    it('schedules a recovery for every spell use the game master reports', async () => {
        const spell = await persistSpell(world.models.spells, {
            recoveryTime: 5000,
        });
        const subject = await storyQuester({
            characterOverrides: knowingSpell(spell._id, 2),
        });

        await service.complete(
            inputOf(subject, [
                {
                    characterId: String(subject.characterId),
                    spellsUsed: [{ spell: String(spell._id), usages: 1 }],
                },
            ]),
        );

        // istante dell'esito = NOW del FixedClock dell'harness
        const dueAt = new Date(NOW.getTime() + 5000);
        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([
            { spell: spell._id, usages: 1, recoveries: [dueAt] },
        ]);
        expect(character.assets.activeSpells).toEqual([
            expect.objectContaining({ spell: spell._id, usages: 1 }),
        ]);
        expect(world.spellQueue.added).toEqual([
            expect.objectContaining({
                data: {
                    characterId: String(subject.characterId),
                    spellId: String(spell._id),
                    dueAt: dueAt.getTime(),
                },
                options: expect.objectContaining({ delay: 5000 }),
            }),
        ]);
    });

    it('rejects an override on a character outside the request without writing', async () => {
        const first = await quester({
            lane: QuestLane.worldMission,
            questOverrides: gmQuest('worldMission'),
        });
        const second = await quester({
            lane: QuestLane.worldMission,
            quest: first.quest,
        });
        const stranger = await storyQuester();

        await expect(
            service.complete(
                inputOf(first, [
                    { characterId: String(stranger.characterId), hpAfter: 10 },
                ]),
            ),
        ).rejects.toMatchObject({
            code: GameRuleErrorCode.OUTCOME_NOT_PARTICIPANT,
        });

        await expectUntouched([first, second], QuestLane.worldMission);
    });

    it('rejects hpAfter 0 without writing', async () => {
        const subject = await storyQuester();

        await expect(
            service.complete(
                inputOf(subject, [
                    { characterId: String(subject.characterId), hpAfter: 0 },
                ]),
            ),
        ).rejects.toMatchObject({
            code: GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
        });

        await expectUntouched([subject], QuestLane.story);
    });

    it.each([
        ['malformed', 'abc'],
        ['missing', new Types.ObjectId().toHexString()],
    ])('answers NOT_FOUND for a %s pending quest', async (_label, id) => {
        await expect(
            service.complete({ pendingQuestId: id }),
        ).rejects.toMatchObject(NOT_FOUND);
    });

    it('answers NOT_FOUND for a pending quest of the standard lane', async () => {
        const subject = await quester({
            questOverrides: { infos: { ...buildQuest().infos, type: 'job' } },
        });

        await expect(service.complete(inputOf(subject))).rejects.toMatchObject(
            NOT_FOUND,
        );

        const character = await characterOf(subject);
        expect(String(character.quests.pendingQuest)).toBe(
            String(subject.pendingQuest._id),
        );
        expect(await pendingQuestExists(subject)).toBe(true);
        expect(await resultsOf(subject)).toHaveLength(0);
    });

    it('completes a travelling participant without touching the travel (Open Q 15)', async () => {
        const subject = await storyQuester();
        const location = new Types.ObjectId();
        const activeTravel = {
            road: { points: [] },
            startTime: NOW,
            endTime: new Date(NOW.getTime() + 60_000),
            duration: 60,
            destination: new Types.ObjectId(),
        };
        await world.models.characters.collection.updateOne(
            { _id: subject.characterId },
            {
                $set: {
                    'status.location': location,
                    'status.activeTravel': activeTravel,
                },
            },
        );

        await expect(service.complete(inputOf(subject))).resolves.toHaveLength(
            1,
        );

        const raw = await world.models.characters.collection.findOne({
            _id: subject.characterId,
        });
        expect(raw?.status.location).toEqual(location);
        expect(raw?.status.activeTravel).toEqual(activeTravel);
        expect(raw?.quests.activeStoryQuest).toBeNull();
    });

    it('answers NOT_FOUND to a repeated completion', async () => {
        const subject = await storyQuester();
        await service.complete(inputOf(subject));

        await expect(service.complete(inputOf(subject))).rejects.toMatchObject(
            NOT_FOUND,
        );
        expect(await resultsOf(subject)).toHaveLength(1);
        expect(questEndPushes()).toHaveLength(1);
    });

    it('lets only one of two concurrent completions win', async () => {
        const subject = await storyQuester();

        const settled = await Promise.allSettled([
            service.complete(inputOf(subject)),
            service.complete(inputOf(subject)),
        ]);

        const fulfilled = settled.filter(
            ({ status }) => status === 'fulfilled',
        );
        const rejected = settled.flatMap((entry) =>
            entry.status === 'rejected' ? [entry.reason] : [],
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toEqual([expect.objectContaining(NOT_FOUND)]);
        expect(await resultsOf(subject)).toHaveLength(1);
        expect(questEndPushes()).toHaveLength(1);
    });

    it('adds the enemy experience to the catalog prize', async () => {
        const enemy = await persistEnemy(world.models.enemies, { xp: 100 });
        const subject = await quester({
            lane: QuestLane.story,
            questOverrides: gmQuest(
                'story',
                { xpPrize: 400 },
                { enemy: enemy._id },
            ),
        });

        const [draft] = await service.complete(inputOf(subject));

        const result = await world.models.questResults
            .findById(draft._id)
            .lean<any>();
        expect(result.xpGained).toBe(500);
        expect(String(result.enemy)).toBe(String(enemy._id));
    });
});
