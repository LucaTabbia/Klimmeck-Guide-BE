import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistEnemy,
    persistLootItem,
    persistPet,
    persistSpell,
    spellBook,
} from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
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

describe('QuestResolutionService.resolveStandard (individual) without an enemy (replSet)', () => {
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

        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'resolved',
        );

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
        const written = await world.models.questResults.find().lean<any[]>();
        expect(written).toHaveLength(1);
        expect(written.map((result) => result.acknowledgedAt)).toEqual(
            written.map(() => null),
        );
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
                    enemies: [{ enemy: enemyId, quantity: 1 }],
                },
            },
        });

        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'resolved',
        );

        const [result] = await resultsOf(subject);
        expect(result).toMatchObject({ outcome: 'success', enemies: [] });
        const messages = warn.mock.calls.map(([message]) => String(message));
        const orphan = messages.find((message) =>
            message.includes(enemyId.toHexString()),
        );
        expect(orphan).toContain(String(subject.quest._id));
        expect(orphan).not.toContain('Caccia segreta');
    });

    describe('the cure of a won quest', () => {
        const VILLAGE_CURE = { lifePointsShare: 0.5, canHeal: ['deepCut'] };

        it('cures a village heal: the listed wound goes, the other stays, life points at half (D-02)', async () => {
            const subject = await quester({
                questOverrides: jobQuest({ cure: VILLAGE_CURE }, 'heal'),
                characterOverrides: {
                    status: {
                        currentLifePoints: 400,
                        injuries: ['deepCut', 'infection'],
                    },
                },
            });

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            expect(character.status.injuries).toEqual(['infection']);
            expect(character.status.currentLifePoints).toBe(500);
            const [result] = await resultsOf(subject);
            expect(result).toMatchObject({ hpBefore: 400, hpAfter: 500 });
            expect(result.injuriesHealed).toEqual(['deepCut']);
        });

        it('cures nothing on a heal quest without a cure (D-01)', async () => {
            const subject = await quester({
                questOverrides: jobQuest({}, 'heal'),
                characterOverrides: {
                    status: { currentLifePoints: 400, injuries: ['deepCut'] },
                },
            });

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            expect(character.status.injuries).toEqual(['deepCut']);
            expect(character.status.currentLifePoints).toBe(400);
            const [result] = await resultsOf(subject);
            expect(result.injuriesHealed).toEqual([]);
        });

        it('cures and teaches on a study that carries a cure (D-07)', async () => {
            const spell = await persistSpell(world.models.spells, {
                minXpToLearn: 200,
                maxUsages: 4,
            });
            const subject = await quester({
                questOverrides: jobQuest(
                    { xpPrize: 300, spell: spell._id, cure: VILLAGE_CURE },
                    'study',
                ),
                characterOverrides: { status: { injuries: ['deepCut'] } },
            });

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            expect(character.status.spells.map(String)).toEqual([
                String(spell._id),
            ]);
            expect(character.status.injuries).toEqual([]);
        });

        it('cures on a job that carries a cure (D-07)', async () => {
            const subject = await quester({
                questOverrides: jobQuest({ xpPrize: 10, cure: VILLAGE_CURE }),
                characterOverrides: { status: { injuries: ['deepCut'] } },
            });

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            expect(character.status.injuries).toEqual([]);
            const [result] = await resultsOf(subject);
            expect(result.injuriesHealed).toEqual(['deepCut']);
        });
    });

    it('teaches the study spell when the xp after the prize is enough', async () => {
        const recoveryAt = new Date('2026-10-24T13:00:00.000Z');
        const known = await persistSpell(world.models.spells);
        const spell = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
            maxUsages: 4,
        });
        const book = spellBook([
            { spell: known._id, usages: 1, recoveries: [recoveryAt] },
        ]);
        const subject = await quester({
            questOverrides: jobQuest(
                { xpPrize: 300, spell: spell._id },
                'study',
            ),
            characterOverrides: {
                status: { spells: book.spells, spellStates: book.spellStates },
            },
        });

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells.map(String)).toEqual([
            String(known._id),
            String(spell._id),
        ]);
        expect(character.status.spellStates).toEqual([
            { spell: known._id, usages: 1, recoveries: [recoveryAt] },
            { spell: spell._id, usages: 4, recoveries: [] },
        ]);
        const [result] = await resultsOf(subject);
        expect(String(result.spellLearned)).toBe(String(spell._id));
    });

    it('teaches no spell whose catalog entry has no max usages', async () => {
        const spell = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
        });
        await world.models.spells.collection.updateOne(
            { _id: spell._id },
            { $unset: { maxUsages: '' } },
        );
        const subject = await quester({
            questOverrides: jobQuest(
                { xpPrize: 300, spell: spell._id },
                'study',
            ),
        });

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells).toEqual([]);
        expect(character.status.spellStates).toEqual([]);
        const [result] = await resultsOf(subject);
        expect(result.spellLearned).toBeNull();
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

        await service.resolveStandard(triggerOf(subject));

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

        await service.resolveStandard(triggerOf(subject));

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

        await service.resolveStandard(triggerOf(subject));
        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'stale',
        );

        expect(await resultsOf(subject)).toHaveLength(1);
        expect(questEndPushes()).toHaveLength(1);
    });

    it('resolves once under concurrent triggers', async () => {
        const subject = await quester({
            questOverrides: jobQuest({ prizeCoins: COINS_PRIZE }),
        });

        const outcomes = await Promise.all([
            service.resolveStandard(triggerOf(subject)),
            service.resolveStandard(triggerOf(subject)),
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
                service.resolveStandard(triggerOf(subject)),
            ).resolves.toBe('waiting');
        } finally {
            clock.advanceSeconds(60);
        }

        await expectUntouched(subject);
    });

    it('ignores a trigger whose start date no longer matches', async () => {
        const subject = await quester({ questOverrides: jobQuest({}) });

        await expect(
            service.resolveStandard(
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

        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'stale',
        );

        await expectUntouched(subject);
    });

    it('ignores an archived character', async () => {
        const subject = await quester({ questOverrides: jobQuest({}) });
        await world.models.characters.updateOne(
            { _id: subject.characterId },
            { $set: { deletedAt: ARCHIVED_AT, deletionReason: 'voluntary' } },
        );

        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'stale',
        );

        await expectUntouched(subject);
    });

    it('ignores a missing pending quest', async () => {
        await expect(
            service.resolveStandard({
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

        await service.resolveStandard(triggerOf(subject));

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

        await expect(service.resolveStandard(triggerOf(subject))).resolves.toBe(
            'stale',
        );

        expect(deliver).not.toHaveBeenCalled();
        await expectUntouched(subject);
    });
});

describe('QuestResolutionService.resolveStandard with an equipped companion (replSet)', () => {
    const ENEMY_XP = 100;
    const ENEMY_QUANTITY = 2;
    const COMPANION_SHARE = 20;
    const TWO_SEATS = [{ title: null, count: 2 }];
    let world: OutcomeHarness;
    let service: QuestResolutionService;
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
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const companionPet = (name: string) =>
        persistPet(world.models.pets, {
            name,
            maxXp: 1000,
            maxLifePoints: 40,
        }) as Promise<{ _id: Types.ObjectId }>;

    const withCompanion = (
        petId: Types.ObjectId,
        entry: Partial<{ xp: number; currentLifePoints: number }> = {},
    ) => ({
        assets: { pet: petId, ownedPets: [buildOwnedPet(petId, entry)] },
    });

    async function huntQuest(type: string, seats: unknown[]) {
        const foe = (await persistEnemy(world.models.enemies, {
            xp: ENEMY_XP,
        })) as { _id: Types.ObjectId };
        return {
            infos: {
                ...buildQuest().infos,
                type,
                title: 'Il branco del guado',
                enemies: [{ enemy: foe._id, quantity: ENEMY_QUANTITY }],
            },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: seats,
            },
            prizes: { ...buildQuest().prizes, xpPrize: 5000 },
        };
    }

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-companion-${seq}`,
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: {
                    ...FRESH_STATUS,
                    ...options.characterOverrides?.status,
                },
            },
        });
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const rawOwnedPetsOf = async (subject: Quester) =>
        (
            await world.models.characters.collection.findOne({
                _id: subject.characterId,
            })
        )?.assets.ownedPets;

    const resultOf = async (subject: Quester) => {
        const [result] = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        return result;
    };

    it('raises the equipped companion by a tenth of the enemies xp in the outcome write (D-04)', async () => {
        const pet = await companionPet('Lupo grigio');
        const subject = await quester({
            questOverrides: await huntQuest('enemy', [
                { title: null, count: 1 },
            ]),
            characterOverrides: withCompanion(pet._id, {
                currentLifePoints: 7,
            }),
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(await rawOwnedPetsOf(subject)).toEqual([
            { pet: pet._id, xp: COMPANION_SHARE, currentLifePoints: 7 },
        ]);
        const result = await resultOf(subject);
        expect(result.petXpGained).toBe(COMPANION_SHARE);
        expect(result.xpGained).toBe(5000 + ENEMY_XP * ENEMY_QUANTITY);
    });

    it("gives each party member's own companion the full share (D-04)", async () => {
        const wolf = await companionPet('Lupo grigio');
        const owl = await companionPet('Gufo delle nevi');
        const first = await quester({
            questOverrides: await huntQuest('boss', TWO_SEATS),
            characterOverrides: withCompanion(wolf._id),
        });
        const second = await quester({
            quest: first.quest,
            characterOverrides: withCompanion(owl._id, { xp: 300 }),
        });

        await expect(resolve(first)).resolves.toBe('resolved');

        expect(await rawOwnedPetsOf(first)).toEqual([
            { pet: wolf._id, xp: COMPANION_SHARE, currentLifePoints: 10 },
        ]);
        expect(await rawOwnedPetsOf(second)).toEqual([
            {
                pet: owl._id,
                xp: 300 + COMPANION_SHARE,
                currentLifePoints: 10,
            },
        ]);
        expect((await resultOf(first)).petXpGained).toBe(COMPANION_SHARE);
        expect((await resultOf(second)).petXpGained).toBe(COMPANION_SHARE);
    });

    it('awards no companion xp on a won quest without enemies (D-04)', async () => {
        const pet = await companionPet('Lupo grigio');
        const subject = await quester({
            questOverrides: {
                infos: {
                    ...buildQuest().infos,
                    type: 'job',
                    title: 'Lavoro al porto',
                },
                prizes: { ...buildQuest().prizes, xpPrize: 5000 },
            },
            characterOverrides: withCompanion(pet._id, { xp: 12 }),
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(await rawOwnedPetsOf(subject)).toEqual([
            { pet: pet._id, xp: 12, currentLifePoints: 10 },
        ]);
        const result = await resultOf(subject);
        expect(result.outcome).toBe('success');
        expect(result.petXpGained).toBe(0);
    });

    it('awards no companion xp on a lost fight (D-04)', async () => {
        const pet = await companionPet('Lupo grigio');
        const subject = await quester({
            questOverrides: await huntQuest('enemy', [
                { title: null, count: 1 },
            ]),
            characterOverrides: withCompanion(pet._id, { xp: 12 }),
        });
        scripted.willEnd('failure');

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(await rawOwnedPetsOf(subject)).toEqual([
            { pet: pet._id, xp: 12, currentLifePoints: 10 },
        ]);
        const result = await resultOf(subject);
        expect(result.outcome).toBe('failure');
        expect(result.petXpGained).toBe(0);
    });
});
