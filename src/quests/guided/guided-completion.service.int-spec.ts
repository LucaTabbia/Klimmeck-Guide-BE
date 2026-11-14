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
                    buildSpell({ name: 'Scintilla', minXpToLearn: 0 }),
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
        expect(world.push.sent).toHaveLength(0);
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
        expect(world.push.sent).toHaveLength(0);
    });

    it('passes through a simulated injury the character already owns (D-14)', async () => {
        const { first, wolf } = await guidedWorldMission();
        combat.willResolve(first.characterId, {
            injuriesAdded: [InjuryType.deepCut],
        });
        await simulate(first, 0, [wolf, 1]);
        await expect(
            saver.save({
                pendingQuestId: hexOf(first),
                fights: [
                    {
                        enemies: enemiesOf([wolf, 1]),
                        corrections: [
                            correctionOf(first, {
                                injuries: [InjuryType.deepCut],
                            }),
                        ],
                    },
                ],
            }),
        ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);

        await service.complete(hexOf(first));

        expect((await characterOf(first)).status.injuries).toEqual([
            InjuryType.deepCut,
        ]);
        expect((await resultOf(first)).outcome).toBe(QuestOutcome.gmCompleted);
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
});
