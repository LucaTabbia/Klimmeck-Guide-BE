import { type Model, Types } from 'mongoose';
import { MissionLockReader } from 'src/characters/mission-lock/mission-lock.reader';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import { PushEventType } from 'src/push/push-event-type.enum';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildLootItem,
    buildPet,
    buildQuest,
    buildSpell,
    persistEnemy,
    persistLootItem,
    persistPet,
    persistSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GuidedCompletionService } from './guided-completion.service';
import { GuidedMissionModule } from './guided-mission.module';
import type { MissionPrizeInput } from './mission-draft.inputs';
import { MissionDraft } from './mission-draft.model';
import { MissionDraftSaveService } from './mission-draft-save.service';
import { MissionDraftService } from './mission-draft.service';
import { MissionSimulationChance } from './mission-simulation.chance';
import { MissionSimulationService } from './mission-simulation.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const NOT_FOUND = { code: 'NOT_FOUND' };
const OUTCOME_OVERRIDE_INVALID = { code: 'OUTCOME_OVERRIDE_INVALID' };
const QUEST_IN_PROGRESS = { code: 'QUEST_IN_PROGRESS' };
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};
const RAW_COLLECTIONS = [
    'characters',
    'missiondrafts',
    'pendingquests',
    'questresults',
    'quests',
] as const;

describe('GuidedCompletionService (replSet)', () => {
    let world: OutcomeHarness;
    let service: GuidedCompletionService;
    let simulation: MissionSimulationService;
    let saver: MissionDraftSaveService;
    let drafts: MissionDraftService;
    let locks: MissionLockReader;
    let draftModel: Model<any>;
    let seq = 0;
    const sharedChance = new SequenceChance();
    const simulationChance = new SequenceChance();
    const combat = new ScriptedCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock: new FixedClock(NOW),
            chance: sharedChance,
            combat,
            imports: [GuidedMissionModule],
            overrides: [
                { token: MissionSimulationChance, useValue: simulationChance },
            ],
        });
        const { app, connection } = world.harness;
        service = app.get(GuidedCompletionService);
        simulation = app.get(MissionSimulationService);
        saver = app.get(MissionDraftSaveService);
        drafts = app.get(MissionDraftService);
        locks = app.get(MissionLockReader, { strict: false });
        draftModel = connection.model(MissionDraft.name);
        await draftModel.init();
    });

    beforeEach(async () => {
        await world.reset();
        combat.reset();
        sharedChance.load([]);
        simulationChance.load([]);
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function quester(options: Partial<QuesterOptions>): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-guided-${seq}`,
            lane: QuestLane.worldMission,
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

    const gmQuest = (type: 'story' | 'worldMission') => ({
        infos: {
            ...buildQuest().infos,
            type,
            title: 'La corte del re',
        },
        requirements: { ...buildQuest().requirements, minTitle: 'rookie' },
        prizes: buildQuest().prizes,
    });

    const hexOf = (subject: Quester) => String(subject.pendingQuest._id);
    const idOf = (document: { _id: unknown }) => document._id as Types.ObjectId;

    // il primo iscritto è un mage ferito con tre pozioni, una magia attiva e un compagno; il secondo è un rookie a vita 900
    async function guidedWorldMission() {
        const page = new Types.ObjectId();
        const potion = idOf(await persistLootItem(world.models.lootItems));
        const spell = idOf(await persistSpell(world.models.spells));
        const wolf = idOf(
            await persistEnemy(world.models.enemies, {
                name: 'Lupo',
                xp: 50,
                relatedLore: [page],
            }),
        );
        const orc = idOf(
            await persistEnemy(world.models.enemies, { name: 'Orco', xp: 30 }),
        );
        const companion = idOf(
            await persistPet(world.models.pets, {
                name: 'Lupo grigio',
                maxXp: 1000,
            }),
        );
        const first = await quester({
            questOverrides: gmQuest('worldMission'),
            characterOverrides: {
                status: {
                    title: 'mage',
                    currentLifePoints: 800,
                    injuries: [InjuryType.deepCut],
                    spellStates: spellStatesOf([
                        { spell, usages: 5, active: true },
                    ]),
                },
                assets: {
                    ownedItems: [
                        { itemType: 'LootItem', item: potion, quantity: 3 },
                    ],
                    pet: companion,
                    ownedPets: [
                        buildOwnedPet(companion, {
                            xp: 5,
                            currentLifePoints: 4,
                        }),
                    ],
                },
            },
        });
        const second = await quester({
            quest: first.quest,
            characterOverrides: { status: { currentLifePoints: 900 } },
        });
        await drafts.start(hexOf(first), null);
        return { first, second, page, potion, spell, wolf, orc, companion };
    }

    async function prizeCatalogue() {
        return {
            commonLoot: idOf(
                await world.models.lootItems.create(
                    buildLootItem({ name: 'Erba comune', rarity: 'common' }),
                ),
            ),
            commonPet: idOf(
                await world.models.pets.create(
                    buildPet({ name: 'Gatto', rarity: 'common' }),
                ),
            ),
            learnable: idOf(
                await world.models.spells.create(
                    buildSpell({ name: 'Scintilla', minLevelToLearn: 1 }),
                ),
            ),
        };
    }

    const enemiesOf = (...entries: [Types.ObjectId, number][]) =>
        entries.map(([enemy, quantity]) => ({
            enemy: String(enemy),
            quantity,
        }));

    const simulate = (
        subject: Quester,
        fightIndex: number,
        ...entries: [Types.ObjectId, number][]
    ) =>
        simulation.simulate({
            pendingQuestId: hexOf(subject),
            fightIndex,
            enemies: enemiesOf(...entries),
        });

    const correctionOf = (
        subject: Quester,
        correction: Omit<ParticipantOverrideInput, 'characterId'>,
    ): ParticipantOverrideInput => ({
        characterId: String(subject.characterId),
        ...correction,
    });

    const prizeOf = (
        subject: Quester,
        overrides: Partial<MissionPrizeInput> = {},
    ): MissionPrizeInput => ({
        characterId: String(subject.characterId),
        coins: { gold: 0, silver: 0, copper: 0 },
        cure: false,
        items: [],
        pet: null,
        spell: null,
        xp: 0,
        ...overrides,
    });

    // due scontri: il primo simulato e corretto per il mage, il secondo solo simulato
    async function playTwoFights(
        mission: Awaited<ReturnType<typeof guidedWorldMission>>,
    ) {
        const { first, second, potion, spell, wolf, orc } = mission;
        combat
            .willResolve(first.characterId, {
                hpAfter: 700,
                consumablesUsed: [{ itemId: String(potion), quantity: 1 }],
                spellsUsed: [{ spellId: String(spell), usages: 1 }],
            })
            .willResolve(second.characterId, { hpAfter: 850 });
        await simulate(first, 0, [wolf, 2]);
        await saver.save({
            pendingQuestId: hexOf(first),
            fights: [
                {
                    enemies: enemiesOf([wolf, 2]),
                    corrections: [
                        correctionOf(first, {
                            hpAfter: 650,
                            injuries: [InjuryType.fracturedRib],
                            consumablesUsed: [
                                { item: String(potion), quantity: 1 },
                            ],
                            spellsUsed: [{ spell: String(spell), usages: 1 }],
                        }),
                    ],
                },
            ],
        });
        combat
            .willResolve(first.characterId, {
                hpAfter: 500,
                injuriesAdded: [InjuryType.blackEye],
                consumablesUsed: [{ itemId: String(potion), quantity: 1 }],
                spellsUsed: [{ spellId: String(spell), usages: 1 }],
            })
            .willResolve(second.characterId, { hpAfter: 800 });
        await simulate(first, 1, [orc, 1], [wolf, 1]);
    }

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const resultOf = async (subject: Quester) => {
        const [result, ...others] = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        expect(others).toHaveLength(0);
        return result;
    };

    const pendingQuestsLeft = () => world.models.pendingQuests.countDocuments();

    const rawDocuments = async () =>
        Object.fromEntries(
            await Promise.all(
                RAW_COLLECTIONS.map(
                    async (name) =>
                        [
                            name,
                            await world.harness.connection
                                .collection(name)
                                .find()
                                .toArray(),
                        ] as const,
                ),
            ),
        );

    const questEndPushes = () =>
        world.push.sent.filter(
            ({ message }) => message.type === PushEventType.questEnd,
        );

    it('writes the corrected state, the merged enemies, the knowledge and the chosen prizes in one transaction (D-07, D-08)', async () => {
        const mission = await guidedWorldMission();
        const { first, second, page, potion, spell, wolf, orc, companion } =
            mission;
        const catalogue = await prizeCatalogue();
        await playTwoFights(mission);
        await saver.save({
            pendingQuestId: hexOf(second),
            prizes: [
                prizeOf(first, {
                    coins: { gold: 1, silver: 2, copper: 3 },
                    xp: 50,
                    items: [
                        { item: String(catalogue.commonLoot), quantity: 2 },
                    ],
                    pet: String(catalogue.commonPet),
                    spell: String(catalogue.learnable),
                }),
                prizeOf(second, { coins: { gold: 0, silver: 5, copper: 0 } }),
            ],
        });

        const written = await service.complete(hexOf(second));

        expect(written).toHaveLength(2);
        const mage = await characterOf(first);
        expect(mage.status.currentLifePoints).toBe(500);
        expect([...mage.status.injuries].sort()).toEqual(
            [
                InjuryType.deepCut,
                InjuryType.fracturedRib,
                InjuryType.blackEye,
            ].sort(),
        );
        expect(mage.status.xp).toBe(3 * 50 + 30 + 50);
        expect(mage.status.coins).toEqual({ gold: 1, silver: 2, copper: 3 });
        expect(
            mage.assets.ownedItems.map(({ item, quantity }: any) => [
                String(item),
                quantity,
            ]),
        ).toEqual([
            [String(potion), 1],
            [String(catalogue.commonLoot), 2],
        ]);
        expect(
            mage.status.spellStates.map(({ spell, usages }: any) => [
                String(spell),
                usages,
            ]),
        ).toEqual([
            [String(spell), 3],
            [String(catalogue.learnable), 3],
        ]);
        expect(
            mage.assets.ownedPets.map(({ pet, xp }: any) => [String(pet), xp]),
        ).toEqual([
            [String(companion), 5 + 18],
            [String(catalogue.commonPet), 0],
        ]);
        expect(mage.status.knownEnemies.map(String)).toEqual([
            String(wolf),
            String(orc),
        ]);
        expect(mage.status.unlockedLore.map(String)).toEqual([String(page)]);
        const mageResult = await resultOf(first);
        expect(mageResult).toMatchObject({
            outcome: QuestOutcome.gmCompleted,
            hpBefore: 800,
            hpAfter: 500,
            xpGained: 230,
            petXpGained: 18,
            enemies: [
                { enemy: wolf, quantity: 3 },
                { enemy: orc, quantity: 1 },
            ],
        });
        expect(String(mageResult.spellLearned)).toBe(
            String(catalogue.learnable),
        );
        const rookie = await characterOf(second);
        expect(rookie.status.currentLifePoints).toBe(800);
        expect(rookie.status.coins).toEqual({ gold: 0, silver: 5, copper: 0 });
        expect(await resultOf(second)).toMatchObject({
            outcome: QuestOutcome.gmCompleted,
            hpAfter: 800,
            xpGained: 180,
            enemies: [
                { enemy: wolf, quantity: 3 },
                { enemy: orc, quantity: 1 },
            ],
        });
        expect(await pendingQuestsLeft()).toBe(0);
        const quest = await world.models.quests
            .findById(first.quest._id)
            .lean<any>();
        expect(quest.concludedAt).toEqual(NOW);
    });

    it('completes a lost simulation as a gm completion with no aid (D-05)', async () => {
        const { first, second, wolf } = await guidedWorldMission();
        combat
            .willEnd('failure')
            .willResolve(first.characterId, { hpAfter: 300 })
            .willResolve(second.characterId, { hpAfter: 200 });
        await simulate(first, 0, [wolf, 1]);
        await simulate(first, 1, [wolf, 1]);

        await service.complete(hexOf(first));

        for (const subject of [first, second]) {
            expect((await resultOf(subject)).outcome).toBe(
                QuestOutcome.gmCompleted,
            );
            expect(
                (await characterOf(subject)).status.awaitingAid ?? null,
            ).toBe(null);
        }
        expect(await world.models.quests.countDocuments()).toBe(1);
    });

    it('never draws from the shared chance (D-08)', async () => {
        const mission = await guidedWorldMission();
        const catalogue = await prizeCatalogue();
        await playTwoFights(mission);
        await saver.save({
            pendingQuestId: hexOf(mission.first),
            prizes: [
                prizeOf(mission.first, {
                    pet: String(catalogue.commonPet),
                    spell: String(catalogue.learnable),
                }),
            ],
        });

        await service.complete(hexOf(mission.first));

        expect(sharedChance.drawn).toEqual([]);
    });

    it('completes a narrative story with prizes only (D-24)', async () => {
        const catalogue = await prizeCatalogue();
        const subject = await quester({
            lane: QuestLane.story,
            questOverrides: gmQuest('story'),
        });
        await drafts.start(hexOf(subject), null);
        await saver.save({
            pendingQuestId: hexOf(subject),
            prizes: [
                prizeOf(subject, {
                    coins: { gold: 2, silver: 0, copper: 0 },
                    items: [
                        { item: String(catalogue.commonLoot), quantity: 1 },
                    ],
                }),
            ],
        });

        await service.complete(hexOf(subject));

        const character = await characterOf(subject);
        expect(character.status.currentLifePoints).toBe(1000);
        expect(character.status.coins).toEqual({
            gold: 2,
            silver: 0,
            copper: 0,
        });
        expect(character.assets.ownedItems).toEqual([
            expect.objectContaining({
                item: catalogue.commonLoot,
                quantity: 1,
            }),
        ]);
        const result = await resultOf(subject);
        expect(result.outcome).toBe(QuestOutcome.gmCompleted);
        expect(result.enemies).toEqual([]);
        expect(result.injuriesAdded).toEqual([]);
    });

    it('unlocks the lore of the spell the innkeeper awards (D-24)', async () => {
        const originLore = new Types.ObjectId();
        const spell = idOf(
            await world.models.spells.create(
                buildSpell({
                    name: 'Eco del Vuoto',
                    origin: 'void',
                    minLevelToLearn: 1,
                    relatedLore: [originLore],
                }),
            ),
        );
        const subject = await quester({
            lane: QuestLane.story,
            questOverrides: gmQuest('story'),
            characterOverrides: { status: { title: 'mage' } },
        });
        await drafts.start(hexOf(subject), null);
        await saver.save({
            pendingQuestId: hexOf(subject),
            prizes: [prizeOf(subject, { spell: String(spell) })],
        });

        await service.complete(hexOf(subject));

        const character = await characterOf(subject);
        expect(character.status.unlockedLore.map(String)).toEqual([
            String(originLore),
        ]);
        const result = await resultOf(subject);
        expect(String(result.spellLearned)).toBe(String(spell));
        expect(result.loreUnlocked.map(String)).toEqual([String(originLore)]);
    });

    it('deletes the draft and frees the participants (D-11, D-25)', async () => {
        const mission = await guidedWorldMission();
        await playTwoFights(mission);
        const subjects = [mission.first, mission.second];
        for (const subject of subjects) {
            expect(await locks.isGuidedLocked(subject.characterId)).toBe(true);
        }

        await service.complete(hexOf(mission.first));

        expect(await draftModel.countDocuments()).toBe(0);
        for (const subject of subjects) {
            expect(await locks.isLocked(subject.characterId)).toBe(false);
            expect(await locks.isGuidedLocked(subject.characterId)).toBe(false);
        }
    });

    it('refuses without a draft (D-25)', async () => {
        const subject = await quester({
            questOverrides: gmQuest('worldMission'),
        });
        const before = await rawDocuments();

        await expect(service.complete(hexOf(subject))).rejects.toMatchObject(
            NOT_FOUND,
        );
        expect(await rawDocuments()).toEqual(before);
    });

    it('refuses an unsimulated fight without writing (D-24)', async () => {
        const { first, wolf } = await guidedWorldMission();
        await saver.save({
            pendingQuestId: hexOf(first),
            fights: [{ enemies: enemiesOf([wolf, 1]) }],
        });
        const before = await rawDocuments();

        await expect(service.complete(hexOf(first))).rejects.toMatchObject(
            OUTCOME_OVERRIDE_INVALID,
        );
        expect(await rawDocuments()).toEqual(before);
        expect(questEndPushes()).toHaveLength(0);
    });

    it('refuses a prize no longer allowed without writing (D-07)', async () => {
        const { first, second } = await guidedWorldMission();
        const catalogue = await prizeCatalogue();
        await saver.save({
            pendingQuestId: hexOf(first),
            prizes: [
                prizeOf(second, {
                    items: [
                        { item: String(catalogue.commonLoot), quantity: 1 },
                    ],
                }),
            ],
        });
        await world.models.lootItems.updateOne(
            { _id: catalogue.commonLoot },
            { $set: { rarity: 'legendary' } },
        );
        const before = await rawDocuments();

        await expect(service.complete(hexOf(first))).rejects.toMatchObject(
            OUTCOME_OVERRIDE_INVALID,
        );
        expect(await rawDocuments()).toEqual(before);
    });

    // il mage di prova parte da 0 xp = livello 1: la magia scelta sale al livello 2 dopo il salvataggio
    it('refuses at completion a chosen spell above the level of the character (D-08)', async () => {
        const { first } = await guidedWorldMission();
        const catalogue = await prizeCatalogue();
        await saver.save({
            pendingQuestId: hexOf(first),
            prizes: [prizeOf(first, { spell: String(catalogue.learnable) })],
        });
        await world.models.spells.collection.updateOne(
            { _id: catalogue.learnable },
            { $set: { minLevelToLearn: 2 } },
        );
        const before = await rawDocuments();

        await expect(service.complete(hexOf(first))).rejects.toMatchObject(
            OUTCOME_OVERRIDE_INVALID,
        );
        expect(await rawDocuments()).toEqual(before);
    });

    it('refuses while a participant has a busy standard lane (D-23)', async () => {
        const { first, second } = await guidedWorldMission();
        await world.models.characters.collection.updateOne(
            { _id: second.characterId },
            { $set: { 'quests.pendingQuest': new Types.ObjectId() } },
        );
        const before = await rawDocuments();

        await expect(service.complete(hexOf(first))).rejects.toMatchObject(
            QUEST_IN_PROGRESS,
        );
        expect(await rawDocuments()).toEqual(before);
    });

    it('refuses a draft saved after the completion read it, without writing (D-18, D-25)', async () => {
        const { first, second } = await guidedWorldMission();
        const readDraft = drafts.requireFor.bind(drafts);
        const state: { saved: Record<string, unknown> | null } = {
            saved: null,
        };
        const spy = jest
            .spyOn(drafts, 'requireFor')
            .mockImplementationOnce(async (request) => {
                const stale = await readDraft(request);
                await saver.save({
                    pendingQuestId: hexOf(second),
                    prizes: [
                        prizeOf(second, {
                            coins: { gold: 7, silver: 0, copper: 0 },
                        }),
                    ],
                });
                state.saved = await rawDocuments();
                return stale;
            });

        try {
            await expect(service.complete(hexOf(first))).rejects.toMatchObject(
                OUTCOME_OVERRIDE_INVALID,
            );
        } finally {
            spy.mockRestore();
        }
        expect(await rawDocuments()).toEqual(state.saved);
        expect(questEndPushes()).toHaveLength(0);
    });

    const expectDeepCutNotAddedAgain = async (subject: Quester) => {
        const { status } = await characterOf(subject);
        expect(status.injuries).toEqual([InjuryType.deepCut]);
        expect(status.innkeeperInjuries ?? []).toEqual([]);
        const result = await resultOf(subject);
        expect(result.outcome).toBe(QuestOutcome.gmCompleted);
        expect(result.injuriesAdded).toEqual([]);
    };

    it('does not add a simulated wound the character already carries (D-19)', async () => {
        const { first, wolf } = await guidedWorldMission();
        combat.willResolve(first.characterId, {
            injuriesAdded: [InjuryType.deepCut],
        });
        await simulate(first, 0, [wolf, 1]);

        await service.complete(hexOf(first));

        await expectDeepCutNotAddedAgain(first);
    });

    it('does not add a carried wound a saved correction proposes again (D-19)', async () => {
        const { first, wolf } = await guidedWorldMission();
        combat.willResolve(first.characterId, {
            injuriesAdded: [InjuryType.deepCut],
        });
        await simulate(first, 0, [wolf, 1]);
        await saver.save({
            pendingQuestId: hexOf(first),
            fights: [
                {
                    enemies: enemiesOf([wolf, 1]),
                    corrections: [
                        correctionOf(first, {
                            hpAfter: 700,
                            injuries: [InjuryType.deepCut],
                        }),
                    ],
                },
            ],
        });

        await service.complete(hexOf(first));

        await expectDeepCutNotAddedAgain(first);
        expect((await characterOf(first)).status.currentLifePoints).toBe(700);
    });

    // una correzione valida al salvataggio può non esserlo più al completamento: la si scrive diretta nella bozza
    const persistCorrection = (
        fightIndex: number,
        subject: Quester,
        corrected: {
            hpAfter: number;
            injuriesAdded?: InjuryType[];
            consumablesUsed?: { item: Types.ObjectId; quantity: number }[];
            spellsUsed?: { spell: Types.ObjectId; usages: number }[];
        },
    ) =>
        world.harness.connection.collection('missiondrafts').updateOne(
            {},
            {
                $set: {
                    [`fights.${fightIndex}.outcomes.$[seat].corrected`]: {
                        injuriesAdded: [],
                        consumablesUsed: [],
                        spellsUsed: [],
                        ...corrected,
                    },
                },
            },
            { arrayFilters: [{ 'seat.character': subject.characterId }] },
        );

    async function expectRefusedWithoutWriting(subject: Quester) {
        const before = await rawDocuments();
        await expect(service.complete(hexOf(subject))).rejects.toMatchObject(
            OUTCOME_OVERRIDE_INVALID,
        );
        expect(await rawDocuments()).toEqual(before);
        expect(questEndPushes()).toHaveLength(0);
    }

    it('ignores at completion a corrected wound the character carries by then (D-19)', async () => {
        const { first, wolf } = await guidedWorldMission();
        await simulate(first, 0, [wolf, 1]);
        await persistCorrection(0, first, {
            hpAfter: 800,
            injuriesAdded: [InjuryType.deepCut],
        });

        await service.complete(hexOf(first));

        await expectDeepCutNotAddedAgain(first);
    });

    it('refuses a corrected consumable usage over what the previous fight leaves (D-06, D-24)', async () => {
        const { first, potion, wolf } = await guidedWorldMission();
        combat.willResolve(first.characterId, {
            consumablesUsed: [{ itemId: String(potion), quantity: 2 }],
        });
        await simulate(first, 0, [wolf, 1]);
        combat.willResolve(first.characterId, {});
        await simulate(first, 1, [wolf, 1]);
        await persistCorrection(1, first, {
            hpAfter: 800,
            consumablesUsed: [{ item: potion, quantity: 2 }],
        });

        await expectRefusedWithoutWriting(first);
    });

    it('refuses a corrected spell usage over what the previous fight leaves (D-06, D-24)', async () => {
        const { first, spell, wolf } = await guidedWorldMission();
        combat.willResolve(first.characterId, {
            spellsUsed: [{ spellId: String(spell), usages: 3 }],
        });
        await simulate(first, 0, [wolf, 1]);
        combat.willResolve(first.characterId, {});
        await simulate(first, 1, [wolf, 1]);
        await persistCorrection(1, first, {
            hpAfter: 800,
            spellsUsed: [{ spell, usages: 3 }],
        });

        await expectRefusedWithoutWriting(first);
    });

    it('refuses a corrected life above the maximum (D-06)', async () => {
        const { first, wolf } = await guidedWorldMission();
        await simulate(first, 0, [wolf, 1]);
        await persistCorrection(0, first, { hpAfter: 1001 });

        await expectRefusedWithoutWriting(first);
    });

    it('lets one of two concurrent completions win, with one result per seat (D-08, D-25)', async () => {
        const { first, second } = await guidedWorldMission();

        const settled = await Promise.allSettled([
            service.complete(hexOf(first)),
            service.complete(hexOf(second)),
        ]);

        expect(
            settled
                .map(({ status }) => status)
                .sort((a, b) => a.localeCompare(b)),
        ).toEqual(['fulfilled', 'rejected']);
        const lost = settled.find(
            (outcome): outcome is PromiseRejectedResult =>
                outcome.status === 'rejected',
        );
        expect(lost?.reason).toMatchObject(NOT_FOUND);
        for (const subject of [first, second]) {
            expect((await resultOf(subject)).outcome).toBe(
                QuestOutcome.gmCompleted,
            );
        }
        expect(await draftModel.countDocuments()).toBe(0);
        expect(questEndPushes()).toHaveLength(2);
    });

    it('delivers the result sheet as today (D-08)', async () => {
        const { first } = await guidedWorldMission();

        const written = await service.complete(hexOf(first));

        expect(written).toHaveLength(2);
        expect(questEndPushes()).toEqual(
            expect.arrayContaining(
                written.map(({ _id }) =>
                    expect.objectContaining({
                        message: expect.objectContaining({ id: String(_id) }),
                    }),
                ),
            ),
        );
        expect(questEndPushes()).toHaveLength(2);
    });

    describe('innkeeper wounds', () => {
        const { blackEye, deepCut, frostbite, sprain } = InjuryType;

        interface PlayedFight {
            simulated: InjuryType[];
            correction?: Omit<ParticipantOverrideInput, 'characterId'>;
        }

        // un solo iscritto con le ferite date; il blocco del suo rango ha una cura solo se ne guarisce qualcuna (la bozza nasce col premio del blocco)
        async function woundedMission(
            status: {
                injuries: InjuryType[];
                innkeeperInjuries?: InjuryType[];
            },
            canHeal: InjuryType[] = [],
        ) {
            const wolf = idOf(
                await persistEnemy(world.models.enemies, {
                    name: 'Lupo',
                    xp: 50,
                }),
            );
            const hero = await quester({
                questOverrides: {
                    ...gmQuest('worldMission'),
                    prizes: {
                        ...buildQuest().prizes,
                        rankPrizes: [
                            {
                                title: 'rookie',
                                xpPrize: 100,
                                randomLoot: [],
                                ...(canHeal.length === 0
                                    ? {}
                                    : {
                                          cure: {
                                              lifePointsShare: 0.5,
                                              canHeal,
                                          },
                                      }),
                            },
                        ],
                    },
                },
                characterOverrides: { status: { title: 'rookie', ...status } },
            });
            await drafts.start(hexOf(hero), null);
            return { hero, wolf };
        }

        // ogni scontro simulato con le sue ferite e poi corretto dall'oste, uno dopo l'altro come nella bozza
        async function play(
            hero: Quester,
            wolf: Types.ObjectId,
            fights: readonly PlayedFight[],
        ) {
            for (const [index, { simulated, correction }] of fights.entries()) {
                combat.willResolve(hero.characterId, {
                    injuriesAdded: simulated,
                });
                await simulate(hero, index, [wolf, 1]);
                if (!correction) continue;
                await saver.save({
                    pendingQuestId: hexOf(hero),
                    fights: fights.slice(0, index + 1).map((played) => ({
                        enemies: enemiesOf([wolf, 1]),
                        ...(played.correction
                            ? {
                                  corrections: [
                                      correctionOf(hero, played.correction),
                                  ],
                              }
                            : {}),
                    })),
                });
            }
        }

        const woundsOf = async (subject: Quester) => {
            const { status } = await characterOf(subject);
            return {
                injuries: [...(status.injuries ?? [])].sort(),
                innkeeperInjuries: [...(status.innkeeperInjuries ?? [])].sort(),
            };
        };

        it('writes a hand-inflicted wound as an innkeeper wound (D-12)', async () => {
            const { hero, wolf } = await woundedMission({ injuries: [] });
            await play(hero, wolf, [
                {
                    simulated: [sprain],
                    correction: { injuries: [sprain, frostbite] },
                },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [frostbite, sprain],
                innkeeperInjuries: [frostbite],
            });
            expect([...(await resultOf(hero)).injuriesAdded].sort()).toEqual([
                frostbite,
                sprain,
            ]);
        });

        it('leaves a simulated wound kept as it is ordinary (D-12)', async () => {
            const { hero, wolf } = await woundedMission({ injuries: [] });
            await play(hero, wolf, [
                { simulated: [sprain], correction: { hpAfter: 700 } },
                { simulated: [blackEye] },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [blackEye, sprain],
                innkeeperInjuries: [],
            });
        });

        it('completes a draft with a wound removed and added again (D-16)', async () => {
            const { hero, wolf } = await woundedMission({
                injuries: [deepCut],
            });
            await play(hero, wolf, [
                {
                    simulated: [],
                    correction: {
                        injuries: [deepCut],
                        injuriesRemoved: [deepCut],
                    },
                },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [deepCut],
                innkeeperInjuries: [deepCut],
            });
            expect(await resultOf(hero)).toMatchObject({
                outcome: QuestOutcome.gmCompleted,
                injuriesAdded: [],
                injuriesRemoved: [],
                injuriesHealed: [],
            });
        });

        it('drops in the second fight a wound the first one added (D-13)', async () => {
            const { hero, wolf } = await woundedMission({ injuries: [] });
            await play(hero, wolf, [
                { simulated: [sprain] },
                { simulated: [], correction: { injuriesRemoved: [sprain] } },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [],
                innkeeperInjuries: [],
            });
            expect(await resultOf(hero)).toMatchObject({
                injuriesAdded: [],
                injuriesRemoved: [],
            });
        });

        it('adds back by hand in the second fight a wound removed in the first (D-13, D-16)', async () => {
            const { hero, wolf } = await woundedMission({
                injuries: [deepCut],
            });
            await play(hero, wolf, [
                { simulated: [], correction: { injuriesRemoved: [deepCut] } },
                { simulated: [], correction: { injuries: [deepCut] } },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [deepCut],
                innkeeperInjuries: [deepCut],
            });
        });

        it('removes a wound carried before the mission (D-13)', async () => {
            const { hero, wolf } = await woundedMission({
                injuries: [deepCut, sprain],
            });
            await play(hero, wolf, [
                { simulated: [], correction: { injuriesRemoved: [deepCut] } },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [sprain],
                innkeeperInjuries: [],
            });
            expect(await resultOf(hero)).toMatchObject({
                injuriesAdded: [],
                injuriesRemoved: [deepCut],
                injuriesHealed: [],
            });
        });

        it('removes an innkeeper wound carried before the mission (D-13)', async () => {
            const { hero, wolf } = await woundedMission({
                injuries: [deepCut, sprain],
                innkeeperInjuries: [deepCut],
            });
            await play(hero, wolf, [
                { simulated: [], correction: { injuriesRemoved: [deepCut] } },
            ]);

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [sprain],
                innkeeperInjuries: [],
            });
            expect((await resultOf(hero)).injuriesRemoved).toEqual([deepCut]);
        });

        it('keeps the innkeeper wounds out of the guided cure prize (D-14)', async () => {
            const { hero, wolf } = await woundedMission(
                { injuries: [deepCut, sprain], innkeeperInjuries: [deepCut] },
                [deepCut, sprain, blackEye],
            );
            await play(hero, wolf, [
                { simulated: [], correction: { injuries: [blackEye] } },
            ]);
            await saver.save({
                pendingQuestId: hexOf(hero),
                prizes: [prizeOf(hero, { cure: true })],
            });

            await service.complete(hexOf(hero));

            expect(await woundsOf(hero)).toEqual({
                injuries: [blackEye, deepCut],
                innkeeperInjuries: [blackEye, deepCut],
            });
            expect((await resultOf(hero)).injuriesHealed).toEqual([sprain]);
        });

        it('refuses at completion the removal of a wound the character no longer carries (D-13)', async () => {
            const { hero, wolf } = await woundedMission({
                injuries: [deepCut, sprain],
            });
            await play(hero, wolf, [
                { simulated: [], correction: { injuriesRemoved: [deepCut] } },
            ]);
            await world.models.characters.collection.updateOne(
                { _id: hero.characterId },
                { $set: { 'status.injuries': [sprain] } },
            );

            await expectRefusedWithoutWriting(hero);
        });

        // uno scontro solo simulato non ha ferite di prima da rivalidare: la rimozione la ferma la sola rivalidazione dell'input
        it('refuses at completion a removal stored on an uncorrected fight the character no longer carries (D-13)', async () => {
            const { hero, wolf } = await woundedMission({
                injuries: [deepCut, sprain],
            });
            await play(hero, wolf, [{ simulated: [] }]);
            await world.harness.connection
                .collection('missiondrafts')
                .updateOne(
                    {},
                    {
                        $set: {
                            'fights.0.outcomes.$[seat].simulated.injuriesRemoved':
                                [frostbite],
                        },
                    },
                    { arrayFilters: [{ 'seat.character': hero.characterId }] },
                );

            await expectRefusedWithoutWriting(hero);
        });
    });

    describe('background additions', () => {
        const MILLER = 'Ha salvato il mugnaio.';
        const BRIDGE = 'Ha tenuto il ponte da sola.';
        const EARLIER = ['Nata a Klim.', 'Cresciuta fra i mulini.'];
        const BACKGROUND_ADDITION_TOO_LONG = {
            code: 'BACKGROUND_ADDITION_TOO_LONG',
        };

        const additionOf = (subject: Quester, text: string) => ({
            characterId: String(subject.characterId),
            text,
        });

        const saveAdditions = (
            subject: Quester,
            ...backgroundAdditions: ReturnType<typeof additionOf>[]
        ) =>
            saver.save({
                pendingQuestId: hexOf(subject),
                backgroundAdditions,
            });

        // un testo che il salvataggio rifiuterebbe o pulirebbe: lo si scrive diretto nella bozza
        const persistAddition = (subject: Quester, text: string) =>
            world.harness.connection.collection('missiondrafts').updateOne(
                {},
                {
                    $set: {
                        backgroundAdditions: [
                            { character: subject.characterId, text },
                        ],
                    },
                },
            );

        const backgroundOf = async (subject: Quester): Promise<unknown> =>
            (await characterOf(subject)).infos.background;

        // due iscritti: il primo ha già due voci nel background
        async function storiedMission() {
            const { first, second } = await guidedWorldMission();
            await world.models.characters.collection.updateOne(
                { _id: first.characterId },
                { $set: { 'infos.background': EARLIER } },
            );
            return { first, second };
        }

        it('appends the addition at the end of the background (D-08)', async () => {
            const { first } = await storiedMission();
            await saveAdditions(first, additionOf(first, MILLER));

            await service.complete(hexOf(first));

            expect(await backgroundOf(first)).toEqual([...EARLIER, MILLER]);
        });

        it('writes nothing for a participant without an addition (D-06)', async () => {
            const { first } = await storiedMission();

            await service.complete(hexOf(first));

            expect(await backgroundOf(first)).toEqual(EARLIER);
            expect((await resultOf(first)).backgroundEntryAdded).toBe(false);
        });

        it('marks the result of each participant whose background got an entry (D-09)', async () => {
            const { first, second } = await storiedMission();
            const untouched = await backgroundOf(second);
            await saveAdditions(first, additionOf(first, MILLER));

            const sheets = await service.complete(hexOf(second));

            expect(sheets.map((sheet) => sheet.backgroundEntryAdded)).toEqual([
                true,
                false,
            ]);
            expect((await resultOf(first)).backgroundEntryAdded).toBe(true);
            expect((await resultOf(second)).backgroundEntryAdded).toBe(false);
            expect(await backgroundOf(second)).toEqual(untouched);
        });

        it('writes each addition to its own participant (D-06)', async () => {
            const { first, second } = await storiedMission();
            const [earlier] = (await backgroundOf(second)) as string[];
            await saveAdditions(
                first,
                additionOf(second, BRIDGE),
                additionOf(first, MILLER),
            );

            await service.complete(hexOf(first));

            expect(await backgroundOf(first)).toEqual([...EARLIER, MILLER]);
            expect(await backgroundOf(second)).toEqual([earlier, BRIDGE]);
        });

        it('writes no background when the completion is refused (D-05)', async () => {
            const { first, second } = await storiedMission();
            const catalogue = await prizeCatalogue();
            await saver.save({
                pendingQuestId: hexOf(first),
                prizes: [
                    prizeOf(second, {
                        items: [
                            { item: String(catalogue.commonLoot), quantity: 1 },
                        ],
                    }),
                ],
                backgroundAdditions: [additionOf(first, MILLER)],
            });
            await world.models.lootItems.updateOne(
                { _id: catalogue.commonLoot },
                { $set: { rarity: 'legendary' } },
            );

            await expectRefusedWithoutWriting(first);
            expect(await backgroundOf(first)).toEqual(EARLIER);
        });

        it('writes no background when the draft was saved after the read (D-05)', async () => {
            const { first, second } = await storiedMission();
            await saveAdditions(first, additionOf(first, MILLER));
            const readDraft = drafts.requireFor.bind(drafts);
            const state: { saved: Record<string, unknown> | null } = {
                saved: null,
            };
            const spy = jest
                .spyOn(drafts, 'requireFor')
                .mockImplementationOnce(async (request) => {
                    const stale = await readDraft(request);
                    await saveAdditions(second, additionOf(second, BRIDGE));
                    state.saved = await rawDocuments();
                    return stale;
                });

            try {
                await expect(
                    service.complete(hexOf(first)),
                ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            } finally {
                spy.mockRestore();
            }
            expect(await rawDocuments()).toEqual(state.saved);
            expect(await backgroundOf(first)).toEqual(EARLIER);
            expect(questEndPushes()).toHaveLength(0);
        });

        it('creates the list for a character written without a background (D-08)', async () => {
            const { first } = await storiedMission();
            await world.models.characters.collection.updateOne(
                { _id: first.characterId },
                { $unset: { 'infos.background': '' } },
            );
            await saveAdditions(first, additionOf(first, MILLER));

            await service.complete(hexOf(first));

            expect(await backgroundOf(first)).toEqual([MILLER]);
        });

        it('refuses at completion an addition over the limit left in the draft (D-07)', async () => {
            const { first } = await storiedMission();
            await persistAddition(first, 'a'.repeat(1001));
            const before = await rawDocuments();

            await expect(service.complete(hexOf(first))).rejects.toMatchObject(
                BACKGROUND_ADDITION_TOO_LONG,
            );
            expect(await rawDocuments()).toEqual(before);
            expect(questEndPushes()).toHaveLength(0);
        });

        it('ignores a blank addition left in the draft (D-06)', async () => {
            const { first } = await storiedMission();
            await persistAddition(first, '   ');

            await service.complete(hexOf(first));

            expect(await backgroundOf(first)).toEqual(EARLIER);
            expect((await resultOf(first)).backgroundEntryAdded).toBe(false);
        });

        it('writes nothing for an addition cleared before the completion (D-06)', async () => {
            const { first } = await storiedMission();
            await saveAdditions(first, additionOf(first, MILLER));
            await saveAdditions(first, additionOf(first, ''));

            await service.complete(hexOf(first));

            expect(await backgroundOf(first)).toEqual(EARLIER);
            expect((await resultOf(first)).backgroundEntryAdded).toBe(false);
        });

        it('deletes the draft with its additions (D-05)', async () => {
            const { first } = await storiedMission();
            await saveAdditions(first, additionOf(first, MILLER));

            await service.complete(hexOf(first));

            expect(await draftModel.countDocuments()).toBe(0);
            expect(await backgroundOf(first)).toEqual([...EARLIER, MILLER]);
        });
    });

    describe('the companion at completion (Phase 23)', () => {
        const RECOVERY_MS = 3_600_000;

        // il primo iscritto porta Fenrir a 60 su 100 (livello 1, base 100, recupero 1 h); il secondo è senza compagno
        async function missionWithFenrir() {
            const wolf = idOf(
                await persistEnemy(world.models.enemies, {
                    name: 'Lupo',
                    xp: 50,
                }),
            );
            const worg = idOf(
                await persistPet(world.models.pets, {
                    name: 'Worg',
                    maxLifePoints: 100,
                    maxXp: 100,
                    recoveryTime: RECOVERY_MS,
                }),
            );
            const first = await quester({
                questOverrides: gmQuest('worldMission'),
                characterOverrides: {
                    assets: {
                        pet: worg,
                        ownedPets: [
                            buildOwnedPet(worg, {
                                currentLifePoints: 60,
                                level: 1,
                                name: 'Fenrir',
                            }),
                        ],
                    },
                },
            });
            const second = await quester({ quest: first.quest });
            await drafts.start(hexOf(first), null);
            return { first, second, wolf, worg };
        }

        const fenrirOf = async (subject: Quester) => {
            const character = await characterOf(subject);
            return {
                slot: character.assets.pet,
                entry: character.assets.ownedPets[0],
            };
        };

        it('defeats a companion corrected to 1 at completion and dates its return (D-17, D-26)', async () => {
            const { first, second, wolf } = await missionWithFenrir();
            combat
                .willResolve(first.characterId, {
                    hpAfter: 900,
                    companionLifeAfter: 50,
                })
                .willResolve(second.characterId, { hpAfter: 950 });
            await simulate(first, 0, [wolf, 1]);
            await saver.save({
                pendingQuestId: hexOf(first),
                fights: [
                    {
                        enemies: enemiesOf([wolf, 1]),
                        corrections: [
                            correctionOf(first, {
                                hpAfter: 900,
                                companionLifeAfter: 1,
                            }),
                        ],
                    },
                ],
            });

            await service.complete(hexOf(first));

            const { slot, entry } = await fenrirOf(first);
            expect(slot).toBeNull();
            expect(entry).toMatchObject({
                currentLifePoints: 1,
                lifeAsOf: NOW,
                defeatedUntil: new Date(NOW.getTime() + RECOVERY_MS),
            });
            const result = await resultOf(first);
            expect(result.outcome).toBe(QuestOutcome.gmCompleted);
            expect(result.companion).toMatchObject({
                name: 'Fenrir',
                lifeBefore: 60,
                lifePoints: 1,
                defeated: true,
            });
            expect((await resultOf(second)).companion).toBeNull();
        });

        it('writes the corrected life of a wounded companion (D-17, D-27)', async () => {
            const { first, second, wolf, worg } = await missionWithFenrir();
            combat
                .willResolve(first.characterId, {
                    hpAfter: 900,
                    companionLifeAfter: 50,
                })
                .willResolve(second.characterId, { hpAfter: 950 });
            await simulate(first, 0, [wolf, 1]);
            await saver.save({
                pendingQuestId: hexOf(first),
                fights: [
                    {
                        enemies: enemiesOf([wolf, 1]),
                        corrections: [
                            correctionOf(first, { companionLifeAfter: 30 }),
                        ],
                    },
                ],
            });

            await service.complete(hexOf(first));

            const { slot, entry } = await fenrirOf(first);
            expect(slot).toEqual(worg);
            expect(entry.currentLifePoints).toBe(30);
            // A-08: la vita omessa nella correzione vale la simulata
            expect((await characterOf(first)).status.currentLifePoints).toBe(
                900,
            );
            expect(entry).not.toHaveProperty('lifeAsOf');
            expect(entry).not.toHaveProperty('defeatedUntil');
            expect((await resultOf(first)).companion).toMatchObject({
                lifeBefore: 60,
                lifePoints: 30,
                defeated: false,
            });
        });

        it('uses the simulated companion life when not corrected (D-17)', async () => {
            const { first, second, wolf, worg } = await missionWithFenrir();
            combat
                .willResolve(first.characterId, {
                    hpAfter: 900,
                    companionLifeAfter: 45,
                })
                .willResolve(second.characterId, { hpAfter: 950 });
            await simulate(first, 0, [wolf, 1]);

            await service.complete(hexOf(first));

            const { slot, entry } = await fenrirOf(first);
            expect(slot).toEqual(worg);
            expect(entry.currentLifePoints).toBe(45);
            expect((await resultOf(first)).companion).toMatchObject({
                lifePoints: 45,
                defeated: false,
            });
        });

        it('keeps a companion defeated in an early fight defeated at completion (D-12, D-26)', async () => {
            const { first, second, wolf } = await missionWithFenrir();
            combat
                .willResolve(first.characterId, {
                    hpAfter: 900,
                    companionLifeAfter: 1,
                })
                .willResolve(second.characterId, { hpAfter: 950 });
            await simulate(first, 0, [wolf, 1]);
            combat
                .willResolve(first.characterId, {
                    hpAfter: 800,
                    companionLifeAfter: 70,
                })
                .willResolve(second.characterId, { hpAfter: 900 });
            await simulate(first, 1, [wolf, 1]);

            await service.complete(hexOf(first));

            const { slot, entry } = await fenrirOf(first);
            expect(slot).toBeNull();
            expect(entry).toMatchObject({
                currentLifePoints: 1,
                lifeAsOf: NOW,
                defeatedUntil: new Date(NOW.getTime() + RECOVERY_MS),
            });
            expect((await resultOf(first)).companion).toMatchObject({
                lifePoints: 1,
                defeated: true,
            });
        });

        it('gives a companion fallen in the first fight no xp (D-13)', async () => {
            const { first, second, wolf } = await missionWithFenrir();
            combat
                .willResolve(first.characterId, {
                    hpAfter: 900,
                    companionLifeAfter: 40,
                })
                .willResolve(second.characterId, { hpAfter: 950 });
            await simulate(first, 0, [wolf, 1]);
            await saver.save({
                pendingQuestId: hexOf(first),
                fights: [
                    {
                        enemies: enemiesOf([wolf, 1]),
                        corrections: [
                            correctionOf(first, { companionLifeAfter: 1 }),
                        ],
                    },
                    { enemies: enemiesOf([wolf, 2]) },
                ],
            });
            combat
                .willResolve(first.characterId, { hpAfter: 800 })
                .willResolve(second.characterId, { hpAfter: 900 });
            await simulate(first, 1, [wolf, 2]);

            await service.complete(hexOf(first));

            const { entry } = await fenrirOf(first);
            expect(entry.xp).toBe(0);
            expect(await resultOf(first)).toMatchObject({
                xpGained: 3 * 50,
                petXpGained: 0,
            });
        });

        it('gives a companion fallen in the last fight the xp of the fights it left standing (D-13)', async () => {
            const { first, second, wolf } = await missionWithFenrir();
            combat
                .willResolve(first.characterId, {
                    hpAfter: 900,
                    companionLifeAfter: 40,
                })
                .willResolve(second.characterId, { hpAfter: 950 });
            await simulate(first, 0, [wolf, 1]);
            combat
                .willResolve(first.characterId, {
                    hpAfter: 800,
                    companionLifeAfter: 1,
                })
                .willResolve(second.characterId, { hpAfter: 900 });
            await simulate(first, 1, [wolf, 2]);

            await service.complete(hexOf(first));

            const { slot, entry } = await fenrirOf(first);
            expect(slot).toBeNull();
            expect(entry.xp).toBe(5);
            expect(await resultOf(first)).toMatchObject({
                xpGained: 3 * 50,
                petXpGained: 5,
            });
        });
    });
});
