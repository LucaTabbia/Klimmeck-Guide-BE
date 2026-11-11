import { Types } from 'mongoose';
import type { OwnedPetEntry } from 'src/characters/pets/owned-pet-entry';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms } from 'src/mongo/document-id';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import {
    OutcomeCharacterSnapshot,
    OutcomeQuestSnapshot,
    ParticipantPlan,
    ParticipantPlanInput,
    planParticipant,
    spellsSpent,
} from 'src/quests/outcomes/outcome-plan';
import {
    DrawnRewards,
    NO_REWARDS,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const CHARACTER_ID = new Types.ObjectId('64b0000000000000000000e1');
const QUEST_ID = new Types.ObjectId('64b0000000000000000000e2');
const PENDING_ID = new Types.ObjectId('64b0000000000000000000e3');
const RESULT_ID = new Types.ObjectId('64b0000000000000000000e4');
const USER_ID = new Types.ObjectId('64b0000000000000000000e5');
const POTION_ID = new Types.ObjectId('64b0000000000000000000e6');
const ENEMY_ID = new Types.ObjectId('64b0000000000000000000e7');
const AID_ID = new Types.ObjectId('64b0000000000000000000e8');
const FAILED_ID = new Types.ObjectId('64b0000000000000000000e9');
const SPELL_ID = new Types.ObjectId('64b0000000000000000000ea');
const LEARNED_SPELL_ID = new Types.ObjectId('64b0000000000000000000eb');
const INJURED_ID = new Types.ObjectId('64b0000000000000000000ec');
const OTHER_INJURED_ID = new Types.ObjectId('64b0000000000000000000ed');
const OTHER_ITEM_ID = new Types.ObjectId('64b0000000000000000000ed');
const OTHER_SPELL_ID = new Types.ObjectId('64b0000000000000000000ee');
const DRAWN_SPELL_ID = new Types.ObjectId('64b0000000000000000000ef');
const PET_ID = new Types.ObjectId('64b0000000000000000000f1');
const OWNED_PET_ID = new Types.ObjectId('64b0000000000000000000f2');
const KNOWN_PAGE_ID = new Types.ObjectId('64b0000000000000000000f3');
const NEW_PAGE_ID = new Types.ObjectId('64b0000000000000000000f4');
const STUDY_LORE_ID = new Types.ObjectId('64b0000000000000000000f5');
const OTHER_STUDY_LORE_ID = new Types.ObjectId('64b0000000000000000000f6');

type SnapshotOverrides = {
    status?: Partial<OutcomeCharacterSnapshot['status']>;
    quests?: OutcomeCharacterSnapshot['quests'];
    assets?: OutcomeCharacterSnapshot['assets'];
};

const snapshotWith = (
    overrides: SnapshotOverrides = {},
): OutcomeCharacterSnapshot => ({
    _id: CHARACTER_ID,
    status: {
        xp: 0,
        level: 1,
        title: TitleType.rookie,
        currentLifePoints: 1000,
        maxLifePoints: 1000,
        injuries: [],
        ...overrides.status,
    },
    quests: overrides.quests ?? { completedQuests: [] },
    assets: overrides.assets ?? { ownedItems: [], ownedEquipments: [] },
});

const questOf = (
    type: QuestType,
    minTitle: TitleType | null = null,
    cure?: unknown,
): OutcomeQuestSnapshot => ({
    _id: QUEST_ID,
    infos: { type, title: 'La quest di prova' },
    requirements: { minTitle },
    ...(cure === undefined ? {} : { prizes: { cure } }),
});

const rewardsWith = (overrides: Partial<DrawnRewards> = {}): DrawnRewards => ({
    ...NO_REWARDS,
    ...overrides,
});

const battleWith = (
    overrides: Partial<ParticipantEffects> = {},
): ParticipantEffects => ({
    characterId: CHARACTER_ID.toHexString(),
    hpAfter: 1000,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
    ...overrides,
});

const inputWith = (
    overrides: Partial<ParticipantPlanInput> = {},
): ParticipantPlanInput => ({
    resultId: RESULT_ID,
    snapshot: snapshotWith(),
    quest: questOf(QuestType.job),
    lane: QuestLane.standard,
    pendingQuestId: PENDING_ID,
    userId: USER_ID,
    verdict: QuestOutcome.success,
    battle: null,
    enemies: null,
    rewards: NO_REWARDS,
    aid: null,
    spellRecoveryTimes: new Map(),
    petMaxXp: new Map(),
    now: NOW,
    ...overrides,
});

const potionStack = (quantity: number) => ({
    itemType: 'LootItem' as const,
    item: POTION_ID,
    quantity,
});

describe('planParticipant', () => {
    describe('a won quest without a fight', () => {
        let plan: ParticipantPlan;
        beforeAll(() => {
            plan = planParticipant(
                inputWith({
                    rewards: rewardsWith({
                        coinsCopper: 150,
                        xpPrize: 300,
                        items: [potionStack(2)],
                    }),
                }),
            );
        });

        it('reasserts identity, lane and expected xp in the filter', () => {
            expect(plan.filter).toEqual({
                _id: CHARACTER_ID,
                deletedAt: null,
                'quests.pendingQuest': { $in: idForms(PENDING_ID) },
                'status.xp': 0,
            });
        });

        it('writes the final state with a single $set', () => {
            expect(Object.keys(plan.update)).toEqual(['$set']);
            expect(plan.update.$set).toMatchObject({
                'status.xp': 300,
                'status.level': 2,
                'status.maxLifePoints': 1200,
                'status.currentLifePoints': 1000,
                'status.injuries': [],
                'assets.ownedItems': [potionStack(2)],
                'assets.ownedEquipments': [],
                'quests.pendingQuest': null,
                'quests.completedQuests': [QUEST_ID],
            });
        });

        it('leaves untouched what did not change', () => {
            for (const key of [
                'status.awaitingAid',
                'status.title',
                'status.spellStates',
                'assets.ownedPets',
            ]) {
                expect(plan.update.$set).not.toHaveProperty([key]);
            }
        });

        it('credits the prize coins as a delta', () => {
            expect(plan.coinsDelta).toBe(150);
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('drafts the result sheet', () => {
            expect(plan.result).toEqual({
                _id: RESULT_ID,
                character: CHARACTER_ID,
                user: USER_ID,
                quest: {
                    id: QUEST_ID,
                    type: QuestType.job,
                    title: 'La quest di prova',
                },
                outcome: QuestOutcome.success,
                resolvedAt: NOW,
                hpBefore: 1000,
                hpAfter: 1000,
                maxLifePoints: 1200,
                injuriesAdded: [],
                injuriesHealed: [],
                consumablesUsed: [],
                spellsUsed: [],
                rewards: {
                    coins: { gold: 0, silver: 1, copper: 50 },
                    items: [potionStack(2)],
                    pet: null,
                },
                xpGained: 300,
                petXpGained: 0,
                xpBefore: 0,
                xpAfter: 300,
                levelBefore: 1,
                levelAfter: 2,
                titleBefore: TitleType.rookie,
                titleAfter: TitleType.rookie,
                spellLearned: null,
                loreUnlocked: [],
                enemies: [],
                stagesCleared: null,
                stagesTotal: null,
                rescuedCharacters: [],
                arrested: false,
                coinsLost: null,
                guardEncounter: false,
            });
        });
    });

    it('writes the dungeon stages it receives into the result (D-12)', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.dungeon),
                stages: { cleared: 2, total: 3 },
            }),
        );

        expect(plan.result.stagesCleared).toBe(2);
        expect(plan.result.stagesTotal).toBe(3);
    });

    it('requires a free standard lane in the write filter of the game master lanes only (D-24)', () => {
        const filterOf = (lane: QuestLane, type: QuestType) =>
            planParticipant(
                inputWith({
                    lane,
                    quest: questOf(type),
                    verdict: QuestOutcome.gmCompleted,
                }),
            ).filter;
        const identity = { _id: CHARACTER_ID, deletedAt: null, 'status.xp': 0 };

        expect(filterOf(QuestLane.story, QuestType.story)).toEqual({
            ...identity,
            'quests.activeStoryQuest': { $in: idForms(PENDING_ID) },
            'quests.pendingQuest': null,
        });
        expect(
            filterOf(QuestLane.worldMission, QuestType.worldMission),
        ).toEqual({
            ...identity,
            'quests.activeWorldMissionQuest': { $in: idForms(PENDING_ID) },
            'quests.pendingQuest': null,
        });
        expect(filterOf(QuestLane.standard, QuestType.job)).toEqual({
            ...identity,
            'quests.pendingQuest': { $in: idForms(PENDING_ID) },
        });
    });

    it('adds the defeated enemy xp to the prize, keeps the fight hp and lists the enemy (D-01)', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.enemy),
                battle: battleWith({ hpAfter: 700 }),
                enemies: {
                    entries: [{ enemy: ENEMY_ID, quantity: 2 }],
                    xp: 200,
                },
                rewards: rewardsWith({ xpPrize: 50 }),
            }),
        );

        expect(plan.result.xpGained).toBe(250);
        expect(plan.result.hpAfter).toBe(700);
        expect(plan.update.$set['status.currentLifePoints']).toBe(700);
        expect(plan.result.enemies).toEqual([{ enemy: ENEMY_ID, quantity: 2 }]);
    });

    describe('clamps', () => {
        it('never lets the fight kill the character', () => {
            const plan = planParticipant(
                inputWith({ battle: battleWith({ hpAfter: 0 }) }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(1);
            expect(plan.result.hpAfter).toBe(1);
        });

        it('caps the fight hp at the maximum before the reward raises it', () => {
            const plan = planParticipant(
                inputWith({
                    battle: battleWith({ hpAfter: 5000 }),
                    rewards: rewardsWith({ xpPrize: 300 }),
                }),
            );

            expect(plan.update.$set['status.maxLifePoints']).toBe(1200);
            expect(plan.update.$set['status.currentLifePoints']).toBe(1000);
        });

        it('caps the xp at 50 000 and the level at 20', () => {
            const plan = planParticipant(
                inputWith({
                    snapshot: snapshotWith({
                        status: {
                            xp: 49_900,
                            level: 19,
                            currentLifePoints: 36_100,
                            maxLifePoints: 36_100,
                        },
                    }),
                    rewards: rewardsWith({ xpPrize: 5000 }),
                }),
            );

            expect(plan.result.xpAfter).toBe(50_000);
            expect(plan.result.levelAfter).toBe(20);
            expect(plan.update.$set['status.xp']).toBe(50_000);
            expect(plan.update.$set['status.level']).toBe(20);
        });
    });

    describe('a lost fight', () => {
        let plan: ParticipantPlan;
        beforeAll(() => {
            plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.enemy),
                    verdict: QuestOutcome.failure,
                    battle: battleWith({ hpAfter: 300 }),
                    enemies: {
                        entries: [{ enemy: ENEMY_ID, quantity: 2 }],
                        xp: 200,
                    },
                    rewards: rewardsWith({ coinsCopper: 150, xpPrize: 300 }),
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );
        });

        it('lists the fought enemies even on a defeat (D-01)', () => {
            expect(plan.result.enemies).toEqual([
                { enemy: ENEMY_ID, quantity: 2 },
            ]);
            expect(plan.result.xpGained).toBe(0);
        });

        it('empties the lane and waits for aid with the hp left', () => {
            expect(plan.update.$set['status.awaitingAid']).toEqual({
                quest: FAILED_ID,
                aidQuest: AID_ID,
                since: NOW,
            });
            expect(plan.update.$set['quests.pendingQuest']).toBeNull();
            expect(plan.update.$set['status.currentLifePoints']).toBe(300);
        });

        it('grants neither prizes nor a completed quest', () => {
            expect(plan.update.$set).not.toHaveProperty([
                'quests.completedQuests',
            ]);
            expect(plan.update.$set['status.xp']).toBe(0);
            expect(plan.coinsDelta).toBe(0);
            expect(plan.result.outcome).toBe(QuestOutcome.failure);
            expect(plan.result.xpGained).toBe(0);
            expect(plan.result.rewards).toEqual({
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [],
                pet: null,
            });
        });
    });

    describe('the pet prize', () => {
        const assetsWithPets = (ownedPets: OwnedPetEntry[]) => ({
            ownedItems: [],
            ownedEquipments: [],
            ownedPets,
        });

        it('adds the won pet as a whole entry with the catalogue life points (D-03)', () => {
            const owned = { pet: OWNED_PET_ID, xp: 30, currentLifePoints: 7 };
            const plan = planParticipant(
                inputWith({
                    snapshot: snapshotWith({
                        assets: assetsWithPets([owned]),
                    }),
                    rewards: rewardsWith({ pet: PET_ID, petLifePoints: 450 }),
                }),
            );

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: OWNED_PET_ID, xp: 30, currentLifePoints: 7 },
                { pet: PET_ID, xp: 0, currentLifePoints: 450 },
            ]);
            expect(plan.result.rewards.pet).toEqual(PET_ID);
        });

        it('leaves the owned pets out of the write when the won pet is already an entry (D-03)', () => {
            const plan = planParticipant(
                inputWith({
                    snapshot: snapshotWith({
                        assets: assetsWithPets([
                            {
                                pet: PET_ID.toHexString(),
                                xp: 30,
                                currentLifePoints: 7,
                            },
                        ]),
                    }),
                    rewards: rewardsWith({ pet: PET_ID, petLifePoints: 450 }),
                }),
            );

            expect(Object.keys(plan.update.$set)).not.toContain(
                'assets.ownedPets',
            );
            expect(plan.result.rewards.pet).toBeNull();
        });

        it('never gives the pet on a defeat (D-21)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.enemy),
                    verdict: QuestOutcome.failure,
                    battle: battleWith({ hpAfter: 300 }),
                    rewards: rewardsWith({ pet: PET_ID }),
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );

            expect(Object.keys(plan.update.$set)).not.toContain(
                'assets.ownedPets',
            );
            expect(plan.result.rewards.pet).toBeNull();
        });

        it('starts the owned pets from an empty list when the sheet has none (D-21)', () => {
            const plan = planParticipant(
                inputWith({
                    rewards: rewardsWith({ pet: PET_ID, petLifePoints: 450 }),
                }),
            );

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: PET_ID, xp: 0, currentLifePoints: 450 },
            ]);
        });

        it.each([null, undefined, -3, 12.5, '450'])(
            'gives a won pet 0 life points when the catalogue has no valid amount (D-03): %p',
            (petLifePoints) => {
                const plan = planParticipant(
                    inputWith({
                        rewards: rewardsWith({ pet: PET_ID, petLifePoints }),
                    }),
                );

                expect(plan.update.$set['assets.ownedPets']).toEqual([
                    { pet: PET_ID, xp: 0, currentLifePoints: 0 },
                ]);
                expect(plan.result.rewards.pet).toEqual(PET_ID);
            },
        );
    });

    describe('the lore of the won pet', () => {
        const PET_PAGE_ID = new Types.ObjectId('64b0000000000000000000f7');
        const victory = { enemyIds: [ENEMY_ID], loreIds: [NEW_PAGE_ID] };
        const petRewards = (petLore: Types.ObjectId[]) =>
            rewardsWith({ pet: PET_ID, petLifePoints: 450, petLore });
        const wonFight = (
            rewards: DrawnRewards,
            assets?: OutcomeCharacterSnapshot['assets'],
        ) =>
            planParticipant(
                inputWith({
                    quest: questOf(QuestType.enemy),
                    snapshot: snapshotWith({
                        status: { unlockedLore: [KNOWN_PAGE_ID] },
                        assets,
                    }),
                    battle: battleWith(),
                    enemies: {
                        entries: [{ enemy: ENEMY_ID, quantity: 1 }],
                        xp: 100,
                    },
                    victory,
                    rewards,
                }),
            );

        it('unlocks the lore of the won pet with the knowledge of the outcome (D-26)', () => {
            const plan = wonFight(petRewards([KNOWN_PAGE_ID, PET_PAGE_ID]));

            expect(plan.update.$addToSet).toEqual({
                'status.unlockedLore': { $each: [NEW_PAGE_ID, PET_PAGE_ID] },
                'status.knownEnemies': { $each: [ENEMY_ID] },
            });
            expect(plan.result.loreUnlocked).toEqual([
                NEW_PAGE_ID,
                PET_PAGE_ID,
            ]);
            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: PET_ID, xp: 0, currentLifePoints: 450 },
            ]);
        });

        it('heals the broken entries of the list rewritten for a won pet (D-03)', () => {
            const plan = planParticipant(
                inputWith({
                    snapshot: snapshotWith({
                        assets: assetsWithPets([
                            { pet: 'not-an-id', xp: 1, currentLifePoints: 1 },
                            { pet: OWNED_PET_ID, xp: null },
                        ] as never),
                    }),
                    rewards: rewardsWith({ pet: PET_ID, petLifePoints: 450 }),
                }),
            );

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: OWNED_PET_ID, xp: 0, currentLifePoints: 0 },
                { pet: PET_ID, xp: 0, currentLifePoints: 450 },
            ]);
        });

        it('unlocks no pet lore when the pet is already owned (D-26)', () => {
            const plan = wonFight(petRewards([PET_PAGE_ID]), {
                ownedItems: [],
                ownedEquipments: [],
                ownedPets: [buildOwnedPet(PET_ID)],
            });

            expect(plan.update.$addToSet).toEqual({
                'status.unlockedLore': { $each: [NEW_PAGE_ID] },
                'status.knownEnemies': { $each: [ENEMY_ID] },
            });
            expect(plan.result.loreUnlocked).toEqual([NEW_PAGE_ID]);
        });

        it('keeps the update unchanged for a won pet without lore (D-26)', () => {
            const plan = wonFight(petRewards([]));
            const beforeTheLore = wonFight(
                rewardsWith({ pet: PET_ID, petLifePoints: 450 }),
            );

            expect(plan.update).toEqual(beforeTheLore.update);
            expect(plan.update.$addToSet).toEqual({
                'status.unlockedLore': { $each: [NEW_PAGE_ID] },
                'status.knownEnemies': { $each: [ENEMY_ID] },
            });
            expect(plan.result.loreUnlocked).toEqual([NEW_PAGE_ID]);
        });
    });

    describe('the xp of the equipped companion', () => {
        const COMPANION_ID = OWNED_PET_ID;
        const companionAssets = (
            ownedPets: OwnedPetEntry[],
            pet: unknown = COMPANION_ID,
        ) => ({
            ownedItems: [],
            ownedEquipments: [],
            pet,
            ownedPets,
        });
        const capsOf = (maxXp: number) =>
            new Map([[COMPANION_ID.toHexString(), maxXp]]);
        const enemiesWorth = (xp: number) => ({
            entries: [{ enemy: ENEMY_ID, quantity: 2 }],
            xp,
        });
        const wonFightWith = (
            ownedPets: OwnedPetEntry[],
            overrides: Partial<ParticipantPlanInput> = {},
        ) =>
            planParticipant(
                inputWith({
                    quest: questOf(QuestType.enemy),
                    snapshot: snapshotWith({
                        assets: companionAssets(ownedPets),
                    }),
                    battle: battleWith({ hpAfter: 700 }),
                    enemies: enemiesWorth(200),
                    petMaxXp: capsOf(1000),
                    ...overrides,
                }),
            );

        it('gives the equipped companion a tenth of the enemies xp only (D-04)', () => {
            const plan = wonFightWith(
                [buildOwnedPet(COMPANION_ID, { xp: 10 })],
                { rewards: rewardsWith({ xpPrize: 5000 }) },
            );

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: COMPANION_ID, xp: 30, currentLifePoints: 10 },
            ]);
            expect(plan.result.petXpGained).toBe(20);
        });

        it('writes the owned pets as one whole list and leaves the other entries untouched (D-04)', () => {
            const first = buildOwnedPet(PET_ID, { xp: 7 });
            const last = buildOwnedPet(new Types.ObjectId(), { xp: 400 });
            const plan = wonFightWith([
                first,
                buildOwnedPet(COMPANION_ID, { xp: 10 }),
                last,
            ]);

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                first,
                { pet: COMPANION_ID, xp: 30, currentLifePoints: 10 },
                last,
            ]);
        });

        it('caps the companion at the catalogue maximum and records the effective gain (D-04, D-17)', () => {
            const plan = wonFightWith([
                buildOwnedPet(COMPANION_ID, { xp: 990 }),
            ]);

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: COMPANION_ID, xp: 1000, currentLifePoints: 10 },
            ]);
            expect(plan.result.petXpGained).toBe(10);
        });

        const expectNoAward = (plan: ParticipantPlan) => {
            expect(Object.keys(plan.update.$set)).not.toContain(
                'assets.ownedPets',
            );
            expect(plan.result.petXpGained).toBe(0);
        };

        it('leaves the owned pets out of the write without an equipped companion (D-04)', () => {
            expectNoAward(
                wonFightWith([buildOwnedPet(COMPANION_ID)], {
                    snapshot: snapshotWith({
                        assets: companionAssets(
                            [buildOwnedPet(COMPANION_ID)],
                            null,
                        ),
                    }),
                }),
            );
        });

        it('leaves the owned pets out of the write when the companion is already at the cap (D-04)', () => {
            expectNoAward(
                wonFightWith([buildOwnedPet(COMPANION_ID, { xp: 1000 })]),
            );
        });

        it('leaves the owned pets out of the write on a won quest without enemies (D-04)', () => {
            expectNoAward(
                wonFightWith([buildOwnedPet(COMPANION_ID)], {
                    battle: null,
                    enemies: null,
                    rewards: rewardsWith({ xpPrize: 5000 }),
                }),
            );
        });

        it('awards nothing on a defeat (D-04)', () => {
            expectNoAward(
                wonFightWith([buildOwnedPet(COMPANION_ID)], {
                    verdict: QuestOutcome.failure,
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );
        });

        it('awards the companion on a game master completion with enemies (D-18)', () => {
            const plan = wonFightWith([buildOwnedPet(COMPANION_ID)], {
                verdict: QuestOutcome.gmCompleted,
            });

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: COMPANION_ID, xp: 20, currentLifePoints: 10 },
            ]);
            expect(plan.result.petXpGained).toBe(20);
        });

        it('awards nothing when the catalogue has no valid cap for the companion (D-17)', () => {
            expectNoAward(
                wonFightWith([buildOwnedPet(COMPANION_ID)], {
                    petMaxXp: new Map(),
                }),
            );
        });

        it('writes the companion xp and the won pet as a single list (D-04)', () => {
            const other = buildOwnedPet(new Types.ObjectId(), { xp: 3 });
            const plan = wonFightWith(
                [other, buildOwnedPet(COMPANION_ID, { xp: 10 })],
                { rewards: rewardsWith({ pet: PET_ID, petLifePoints: 450 }) },
            );

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                other,
                { pet: COMPANION_ID, xp: 30, currentLifePoints: 10 },
                { pet: PET_ID, xp: 0, currentLifePoints: 450 },
            ]);
            expect(plan.result.petXpGained).toBe(20);
            expect(plan.result.rewards.pet).toEqual(PET_ID);
        });

        it('never changes the life points of the companion (D-04)', () => {
            const plan = wonFightWith([
                buildOwnedPet(COMPANION_ID, { currentLifePoints: 3 }),
            ]);

            expect(plan.update.$set['assets.ownedPets']).toEqual([
                { pet: COMPANION_ID, xp: 20, currentLifePoints: 3 },
            ]);
        });

        it('leaves the snapshot entries untouched (D-04)', () => {
            const entry = buildOwnedPet(COMPANION_ID, { xp: 10 });

            wonFightWith([entry]);

            expect(entry).toEqual({
                pet: COMPANION_ID,
                xp: 10,
                currentLifePoints: 10,
            });
        });
    });

    it('refuses a failure without an aid quest', () => {
        expect(() =>
            planParticipant(
                inputWith({
                    verdict: QuestOutcome.failure,
                    battle: battleWith({ hpAfter: 300 }),
                }),
            ),
        ).toThrow('failure outcome requires an aid quest');
    });

    describe('the cure of a won quest', () => {
        const VILLAGE = { lifePointsShare: 0.5, canHeal: [InjuryType.deepCut] };

        const woundedWith = (
            currentLifePoints: number,
            injuries: InjuryType[],
        ): OutcomeCharacterSnapshot =>
            snapshotWith({ status: { currentLifePoints, injuries } });

        it('heals nothing on a won heal without a cure (D-07)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.heal),
                    snapshot: woundedWith(400, [InjuryType.deepCut]),
                    rewards: rewardsWith({ xpPrize: 300 }),
                }),
            );

            expect(plan.update.$set['status.injuries']).toEqual([
                InjuryType.deepCut,
            ]);
            expect(plan.update.$set['status.currentLifePoints']).toBe(400);
            expect(plan.result.hpAfter).toBe(400);
            expect(plan.result.injuriesHealed).toEqual([]);
        });

        it('raises the life points to the share of the maximum and removes only the listed injuries (D-02)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.heal, null, VILLAGE),
                    snapshot: woundedWith(400, [
                        InjuryType.deepCut,
                        InjuryType.infection,
                    ]),
                }),
            );

            expect(plan.update.$set['status.injuries']).toEqual([
                InjuryType.infection,
            ]);
            expect(plan.update.$set['status.currentLifePoints']).toBe(500);
            expect(plan.result).toMatchObject({
                hpBefore: 400,
                hpAfter: 500,
                injuriesHealed: [InjuryType.deepCut],
                injuriesAdded: [],
            });
        });

        it('never lowers life points already above the floor (D-02)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.heal, null, VILLAGE),
                    snapshot: woundedWith(700, []),
                }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(700);
        });

        it('cures only the injuries with a share of 0 (D-02)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.heal, null, {
                        lifePointsShare: 0,
                        canHeal: [InjuryType.deepCut],
                    }),
                    snapshot: woundedWith(400, [InjuryType.deepCut]),
                }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(400);
            expect(plan.update.$set['status.injuries']).toEqual([]);
        });

        it('computes the floor on the maximum after the level up (D-02)', () => {
            const healWith = (lifePointsShare: number) =>
                planParticipant(
                    inputWith({
                        quest: questOf(QuestType.heal, null, {
                            lifePointsShare,
                            canHeal: [],
                        }),
                        snapshot: woundedWith(400, []),
                        rewards: rewardsWith({ xpPrize: 300 }),
                    }),
                );

            expect(healWith(0.5).update.$set['status.maxLifePoints']).toBe(
                1200,
            );
            expect(healWith(0.5).update.$set['status.currentLifePoints']).toBe(
                600,
            );
            expect(healWith(1).update.$set['status.currentLifePoints']).toBe(
                1200,
            );
        });

        it.each([QuestType.job, QuestType.story, QuestType.study])(
            'cures a won %s that carries a cure (D-07)',
            (type) => {
                const plan = planParticipant(
                    inputWith({
                        quest: questOf(type, null, VILLAGE),
                        snapshot: woundedWith(400, [InjuryType.deepCut]),
                    }),
                );

                expect(plan.update.$set['status.currentLifePoints']).toBe(500);
                expect(plan.update.$set['status.injuries']).toEqual([]);
                expect(plan.result.injuriesHealed).toEqual([
                    InjuryType.deepCut,
                ]);
            },
        );

        it('cures a game master completion like a success (D-07)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.job, null, VILLAGE),
                    snapshot: woundedWith(400, [InjuryType.deepCut]),
                    verdict: QuestOutcome.gmCompleted,
                }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(500);
            expect(plan.update.$set['status.injuries']).toEqual([]);
            expect(plan.result.injuriesHealed).toEqual([InjuryType.deepCut]);
        });

        it('cures nothing on a defeat (D-07)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.enemy, null, {
                        lifePointsShare: 1,
                        canHeal: [InjuryType.deepCut],
                    }),
                    verdict: QuestOutcome.failure,
                    battle: battleWith({
                        hpAfter: 300,
                        injuriesAdded: [InjuryType.deepCut],
                    }),
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(300);
            expect(plan.update.$set['status.injuries']).toEqual([
                InjuryType.deepCut,
            ]);
            expect(plan.result.injuriesHealed).toEqual([]);
        });

        it('cures after the fight and after the progression: the wounds taken in the same outcome are healed too (D-20)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.job, null, {
                        lifePointsShare: 0.5,
                        canHeal: [InjuryType.deepCut, InjuryType.sprain],
                    }),
                    snapshot: woundedWith(1000, [
                        InjuryType.sprain,
                        InjuryType.infection,
                    ]),
                    battle: battleWith({
                        hpAfter: 300,
                        injuriesAdded: [
                            InjuryType.deepCut,
                            InjuryType.frostbite,
                        ],
                    }),
                    rewards: rewardsWith({ xpPrize: 300 }),
                }),
            );

            expect(plan.update.$set['status.injuries']).toEqual([
                InjuryType.infection,
                InjuryType.frostbite,
            ]);
            expect(plan.result.injuriesAdded).toEqual([
                InjuryType.deepCut,
                InjuryType.frostbite,
            ]);
            expect(plan.result.injuriesHealed).toEqual([
                InjuryType.sprain,
                InjuryType.deepCut,
            ]);
            expect(plan.update.$set['status.currentLifePoints']).toBe(600);
            expect(plan.result.hpBefore).toBe(1000);
            expect(plan.result.hpAfter).toBe(600);
        });

        it('keeps on the sheet a wound taken and healed in the same outcome, never on the character (D-20)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.job, null, VILLAGE),
                    battle: battleWith({ injuriesAdded: [InjuryType.deepCut] }),
                }),
            );

            expect(plan.update.$set['status.injuries']).toEqual([]);
            expect(plan.result.injuriesAdded).toEqual([InjuryType.deepCut]);
            expect(plan.result.injuriesHealed).toEqual([InjuryType.deepCut]);
        });

        it('reads a share outside the scale as 0 and still cures the injuries (D-23)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.heal, null, {
                        lifePointsShare: 50,
                        canHeal: [InjuryType.deepCut],
                    }),
                    snapshot: woundedWith(400, [InjuryType.deepCut]),
                }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(400);
            expect(plan.update.$set['status.injuries']).toEqual([]);
        });

        it('ignores a malformed cure (D-23)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.heal, null, 'full'),
                    snapshot: woundedWith(400, [InjuryType.deepCut]),
                }),
            );

            expect(plan.update.$set['status.currentLifePoints']).toBe(400);
            expect(plan.update.$set['status.injuries']).toEqual([
                InjuryType.deepCut,
            ]);
            expect(plan.result.injuriesHealed).toEqual([]);
        });

        it('keeps the write filter unchanged when curing (D-07)', () => {
            const cured = planParticipant(
                inputWith({ quest: questOf(QuestType.job, null, VILLAGE) }),
            );
            const plain = planParticipant(
                inputWith({ quest: questOf(QuestType.job) }),
            );

            expect(cured.filter).toEqual(plain.filter);
        });

        it('never writes the potion recovery from an outcome (D-16)', () => {
            const plan = planParticipant(
                inputWith({ quest: questOf(QuestType.job, null, VILLAGE) }),
            );

            expect(Object.keys(plan.update.$set).sort()).toEqual(
                [
                    'status.xp',
                    'status.level',
                    'status.maxLifePoints',
                    'status.currentLifePoints',
                    'status.injuries',
                    'assets.ownedItems',
                    'assets.ownedEquipments',
                    'quests.pendingQuest',
                    'quests.completedQuests',
                ].sort(),
            );
        });
    });

    it('lists no healed injury on a quest that heals nothing (D-08)', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.job),
                snapshot: snapshotWith({
                    status: { injuries: [InjuryType.deepCut] },
                }),
            }),
        );

        expect(plan.result.injuriesHealed).toEqual([]);
        expect(plan.update.$set['status.injuries']).toEqual([
            InjuryType.deepCut,
        ]);
    });

    it('keeps existing injuries and records only the new ones', () => {
        const plan = planParticipant(
            inputWith({
                snapshot: snapshotWith({
                    status: { injuries: [InjuryType.deepCut] },
                }),
                battle: battleWith({
                    injuriesAdded: [InjuryType.deepCut, InjuryType.frostbite],
                }),
            }),
        );

        expect(plan.update.$set['status.injuries']).toEqual([
            InjuryType.deepCut,
            InjuryType.frostbite,
        ]);
        expect(plan.result.injuriesAdded).toEqual([InjuryType.frostbite]);
    });

    describe('consumables', () => {
        const withPotions = (
            consumablesUsed: ParticipantEffects['consumablesUsed'],
        ) =>
            planParticipant(
                inputWith({
                    snapshot: snapshotWith({
                        assets: {
                            ownedItems: [potionStack(2)],
                            ownedEquipments: [],
                        },
                    }),
                    battle: battleWith({ consumablesUsed }),
                }),
            );

        it('removes what the fight used', () => {
            const plan = withPotions([
                { itemId: POTION_ID.toHexString(), quantity: 1 },
            ]);

            expect(plan.update.$set['assets.ownedItems']).toEqual([
                potionStack(1),
            ]);
            expect(plan.result.consumablesUsed).toEqual([potionStack(1)]);
        });

        it('clamps the use to what is owned and drops the empty entry', () => {
            const plan = withPotions([
                { itemId: POTION_ID.toHexString(), quantity: 3 },
            ]);

            expect(plan.update.$set['assets.ownedItems']).toEqual([]);
            expect(plan.result.consumablesUsed).toEqual([potionStack(2)]);
        });

        it('ignores an item the character does not own', () => {
            const plan = withPotions([
                { itemId: OTHER_ITEM_ID.toHexString(), quantity: 1 },
            ]);

            expect(plan.update.$set['assets.ownedItems']).toEqual([
                potionStack(2),
            ]);
            expect(plan.result.consumablesUsed).toEqual([]);
        });
    });

    describe('spells', () => {
        const RECOVERY_MS = 5000;
        const DUE = new Date(NOW.getTime() + RECOVERY_MS);
        const LATER = new Date(NOW.getTime() + 60000);
        const stateOf = (
            usages: number,
            recoveries: Date[] = [],
            active = true,
            spell: unknown = SPELL_ID,
        ) => ({ spell, usages, recoveries, active });
        const knowing = (
            ...spellStates: NonNullable<
                OutcomeCharacterSnapshot['status']['spellStates']
            >
        ): SnapshotOverrides => ({ status: { spellStates } });
        const knowingSpell = (
            usages: number,
            recoveries: Date[] = [],
            active = true,
        ) => knowing(stateOf(usages, recoveries, active));
        const fightWith = (
            snapshot: SnapshotOverrides,
            spellsUsed: ParticipantEffects['spellsUsed'],
            overrides: Partial<ParticipantPlanInput> = {},
        ) =>
            planParticipant(
                inputWith({
                    snapshot: snapshotWith(snapshot),
                    battle: battleWith({ spellsUsed }),
                    spellRecoveryTimes: new Map([
                        [SPELL_ID.toHexString(), RECOVERY_MS],
                    ]),
                    ...overrides,
                }),
            );
        const using = (usages: number, spell = SPELL_ID) => [
            { spellId: spell.toHexString(), usages },
        ];
        const triggerOf = (spell = SPELL_ID) => ({
            characterId: CHARACTER_ID.toHexString(),
            spellId: spell.toHexString(),
            dueAt: DUE,
        });

        it('«Il timer di recupero non si interrompe mai»: spends the spell state with one due instant per use, duplicates kept in order', () => {
            const plan = fightWith(knowingSpell(3, [LATER]), using(2));

            expect(plan.update.$set['status.spellStates']).toEqual([
                stateOf(1, [DUE, DUE, LATER]),
            ]);
            expect(plan.result.spellsUsed).toEqual([
                { spell: SPELL_ID, usages: 2 },
            ]);
            expect(plan.spellRecoveries).toEqual([triggerOf()]);
        });

        it('gives every recovery trigger exactly the keys of the new contract', () => {
            const plan = fightWith(knowingSpell(3), using(1));

            expect(plan.spellRecoveries).toHaveLength(1);
            for (const recovery of plan.spellRecoveries) {
                expect(Object.keys(recovery).sort()).toEqual([
                    'characterId',
                    'dueAt',
                    'spellId',
                ]);
            }
        });

        it('never spends more usages than the spell state holds', () => {
            const plan = fightWith(knowingSpell(2), using(3));

            expect(plan.update.$set['status.spellStates']).toEqual([
                stateOf(0, [DUE, DUE]),
            ]);
            expect(plan.result.spellsUsed).toEqual([
                { spell: SPELL_ID, usages: 2 },
            ]);
            expect(plan.spellRecoveries).toEqual([triggerOf()]);
        });

        it('spends only the spells whose state is active (D-07)', () => {
            const plan = fightWith(
                knowing(stateOf(2), stateOf(2, [], false, OTHER_SPELL_ID)),
                [...using(1), ...using(1, OTHER_SPELL_ID)],
            );

            expect(plan.result.spellsUsed).toEqual([
                { spell: SPELL_ID, usages: 1 },
            ]);
            expect(plan.update.$set['status.spellStates']).toEqual([
                stateOf(1, [DUE]),
                stateOf(2, [], false, OTHER_SPELL_ID),
            ]);
            expect(plan.spellRecoveries).toEqual([triggerOf()]);
        });

        it('spends nothing from a known spell whose state is not active (D-07)', () => {
            const plan = fightWith(knowingSpell(2, [], false), using(1));

            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.spellStates',
            );
            expect(plan.result.spellsUsed).toEqual([]);
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('reads a spell state stored without the flag as not active (D-07)', () => {
            const plan = fightWith(
                knowing({ spell: SPELL_ID, usages: 2, recoveries: [] }),
                using(1),
            );

            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.spellStates',
            );
            expect(plan.result.spellsUsed).toEqual([]);
        });

        it('ignores a spell without a state', () => {
            const plan = fightWith(knowingSpell(2), using(1, OTHER_SPELL_ID));

            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.spellStates',
            );
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('spends nothing for a character without spell states (D-07)', () => {
            const plan = fightWith({}, using(1));

            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.spellStates',
            );
            expect(plan.result.spellsUsed).toEqual([]);
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('spends a spell with no known recovery time without an instant or a trigger', () => {
            const plan = fightWith(knowingSpell(2), using(1), {
                spellRecoveryTimes: new Map(),
            });

            expect(plan.update.$set['status.spellStates']).toEqual([
                stateOf(1),
            ]);
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('writes no spell state when no spell is used', () => {
            const plan = fightWith(knowingSpell(2), []);

            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.spellStates',
            );
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('keeps the active flag and the order of the spell states it writes (D-07)', () => {
            const plan = fightWith(
                knowing(
                    stateOf(1, [LATER], false, OTHER_SPELL_ID),
                    stateOf(2),
                    stateOf(0, [LATER, LATER], true, LEARNED_SPELL_ID),
                ),
                using(1),
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                stateOf(1, [LATER], false, OTHER_SPELL_ID),
                stateOf(1, [DUE]),
                stateOf(0, [LATER, LATER], true, LEARNED_SPELL_ID),
            ]);
        });

        it('writes the spell states alone when spells are spent (D-07)', () => {
            const plan = fightWith(knowingSpell(2), using(1));

            expect(Object.keys(plan.update.$set).sort()).toEqual([
                'assets.ownedEquipments',
                'assets.ownedItems',
                'quests.completedQuests',
                'quests.pendingQuest',
                'status.currentLifePoints',
                'status.injuries',
                'status.level',
                'status.maxLifePoints',
                'status.spellStates',
                'status.xp',
            ]);
        });

        it('returns the spent states, the usages and the triggers, nothing else (D-07)', () => {
            const spent = spellsSpent(
                CHARACTER_ID,
                [stateOf(2), stateOf(1, [], false, OTHER_SPELL_ID)],
                using(1),
                new Map([[SPELL_ID.toHexString(), RECOVERY_MS]]),
                NOW,
            );

            expect(spent).toEqual({
                spellStates: [
                    stateOf(1, [DUE]),
                    stateOf(1, [], false, OTHER_SPELL_ID),
                ],
                used: [{ spell: SPELL_ID, usages: 1 }],
                recoveries: [triggerOf()],
            });
        });

        it('returns no states when nothing is spent (D-07)', () => {
            expect(
                spellsSpent(CHARACTER_ID, [stateOf(2)], [], new Map(), NOW),
            ).toEqual({ spellStates: null, used: [], recoveries: [] });
        });

        it('composes spending and learning in one spell state', () => {
            const plan = fightWith(knowingSpell(2), using(1), {
                quest: questOf(QuestType.study),
                rewards: rewardsWith({
                    xpPrize: 300,
                    spellCandidate: {
                        spellId: LEARNED_SPELL_ID,
                        minXpToLearn: 300,
                        maxUsages: 4,
                    },
                }),
            });

            expect(plan.update.$set['status.spellStates']).toEqual([
                stateOf(1, [DUE]),
                stateOf(4, [], false, LEARNED_SPELL_ID),
            ]);
        });

        it('leaves the snapshot spell state untouched', () => {
            const snapshot = knowingSpell(2);

            fightWith(snapshot, using(1));

            expect(snapshot.status?.spellStates).toEqual([stateOf(2)]);
        });
    });

    describe('spell learning on a won study', () => {
        const RECOVERY_AT = new Date('2026-10-24T11:00:00.000Z');
        const learnedState = {
            spell: LEARNED_SPELL_ID,
            usages: 4,
            recoveries: [],
            active: false,
        };
        const studyWith = (
            minXpToLearn: number,
            snapshot: SnapshotOverrides = {},
            overrides: Partial<ParticipantPlanInput> = {},
        ) =>
            planParticipant(
                inputWith({
                    quest: questOf(QuestType.study),
                    snapshot: snapshotWith(snapshot),
                    rewards: rewardsWith({
                        xpPrize: 300,
                        spellCandidate: {
                            spellId: LEARNED_SPELL_ID,
                            minXpToLearn,
                            maxUsages: 4,
                        },
                    }),
                    ...overrides,
                }),
            );
        const expectNothingLearned = (plan: ParticipantPlan) => {
            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.spellStates',
            );
            expect(plan.result.spellLearned).toBeNull();
        };

        it('learns the spell with a full spell state in the same $set', () => {
            const known = {
                spell: SPELL_ID,
                usages: 1,
                recoveries: [RECOVERY_AT],
                active: true,
            };
            const snapshot = { status: { spellStates: [known] } };

            const plan = studyWith(300, snapshot);

            expect(plan.update.$set['status.spellStates']).toEqual([
                {
                    spell: SPELL_ID,
                    usages: 1,
                    recoveries: [RECOVERY_AT],
                    active: true,
                },
                learnedState,
            ]);
            expect(plan.result.spellLearned).toBe(LEARNED_SPELL_ID);
            expect(snapshot.status.spellStates).toEqual([known]);
        });

        it('appends a learned spell as a state that is not active (D-07)', () => {
            const plan = studyWith(300, {
                status: {
                    spellStates: [
                        {
                            spell: SPELL_ID,
                            usages: 2,
                            recoveries: [],
                            active: true,
                        },
                    ],
                },
            });

            const written = plan.update.$set['status.spellStates'] as unknown[];
            expect(written).toHaveLength(2);
            expect(written.at(-1)).toEqual({
                spell: LEARNED_SPELL_ID,
                usages: 4,
                recoveries: [],
                active: false,
            });
        });

        it('writes the spell states alone when a spell is learned (D-07)', () => {
            const plan = studyWith(300);

            expect(Object.keys(plan.update.$set).sort()).toEqual([
                'assets.ownedEquipments',
                'assets.ownedItems',
                'quests.completedQuests',
                'quests.pendingQuest',
                'status.currentLifePoints',
                'status.injuries',
                'status.level',
                'status.maxLifePoints',
                'status.spellStates',
                'status.xp',
            ]);
        });

        it('only grants xp when the xp is not enough', () => {
            expectNothingLearned(studyWith(400));
        });

        it('never learns a spell that already has a state (D-07)', () => {
            expectNothingLearned(
                studyWith(300, {
                    status: {
                        spellStates: [
                            {
                                spell: LEARNED_SPELL_ID,
                                usages: 0,
                                recoveries: [],
                                active: false,
                            },
                        ],
                    },
                }),
            );
        });

        it('does not learn a spell whose state holds a legacy string ref', () => {
            expectNothingLearned(
                studyWith(300, {
                    status: {
                        spellStates: [
                            {
                                spell: LEARNED_SPELL_ID.toHexString(),
                                usages: 1,
                                recoveries: [],
                            },
                        ],
                    },
                }),
            );
        });

        it('learns the drawn spell when the quest draws one (D-31)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.study),
                    rewards: rewardsWith({
                        xpPrize: 300,
                        spellDraw: {
                            pool: [
                                {
                                    spellId: LEARNED_SPELL_ID,
                                    minXpToLearn: 100,
                                    maxUsages: 4,
                                },
                                {
                                    spellId: DRAWN_SPELL_ID,
                                    minXpToLearn: 200,
                                    maxUsages: 2,
                                },
                            ],
                            gate: 0.1,
                            roll: 0.6,
                        },
                    }),
                }),
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                {
                    spell: DRAWN_SPELL_ID,
                    usages: 2,
                    recoveries: [],
                    active: false,
                },
            ]);
            expect(plan.result.spellLearned).toBe(DRAWN_SPELL_ID);
        });

        it('never draws a spell that already has a state (D-07, D-31)', () => {
            const plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.study),
                    snapshot: snapshotWith({
                        status: {
                            spellStates: [
                                {
                                    spell: DRAWN_SPELL_ID,
                                    usages: 2,
                                    recoveries: [],
                                    active: true,
                                },
                            ],
                        },
                    }),
                    rewards: rewardsWith({
                        xpPrize: 300,
                        spellDraw: {
                            pool: [
                                {
                                    spellId: DRAWN_SPELL_ID,
                                    minXpToLearn: 0,
                                    maxUsages: 2,
                                },
                            ],
                            gate: 0,
                            roll: 0,
                        },
                    }),
                }),
            );

            expectNothingLearned(plan);
        });

        it('learns no drawn spell when the gate misses the 30% chance (quick 261111-sdc)', () => {
            expectNothingLearned(
                studyWith(
                    300,
                    {},
                    {
                        rewards: rewardsWith({
                            xpPrize: 300,
                            spellDraw: {
                                pool: [
                                    {
                                        spellId: DRAWN_SPELL_ID,
                                        minXpToLearn: 0,
                                        maxUsages: 2,
                                    },
                                ],
                                gate: 0.3,
                                roll: 0,
                            },
                        }),
                    },
                ),
            );
        });

        it('keeps the fixed spell of the study when present (D-31)', () => {
            const plan = studyWith(
                300,
                {},
                {
                    rewards: rewardsWith({
                        xpPrize: 300,
                        spellCandidate: {
                            spellId: LEARNED_SPELL_ID,
                            minXpToLearn: 300,
                            maxUsages: 4,
                        },
                        spellDraw: {
                            pool: [
                                {
                                    spellId: DRAWN_SPELL_ID,
                                    minXpToLearn: 0,
                                    maxUsages: 2,
                                },
                            ],
                            gate: 0.99,
                            roll: 0,
                        },
                    }),
                },
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                learnedState,
            ]);
            expect(plan.result.spellLearned).toBe(LEARNED_SPELL_ID);
        });

        it('learns no drawn spell from a lost fight (D-31)', () => {
            expectNothingLearned(
                studyWith(
                    0,
                    {},
                    {
                        verdict: QuestOutcome.failure,
                        aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                        rewards: rewardsWith({
                            spellDraw: {
                                pool: [
                                    {
                                        spellId: DRAWN_SPELL_ID,
                                        minXpToLearn: 0,
                                        maxUsages: 2,
                                    },
                                ],
                                gate: 0,
                                roll: 0,
                            },
                        }),
                    },
                ),
            );
        });

        it('learns nothing from a lost fight', () => {
            expectNothingLearned(
                studyWith(
                    0,
                    {},
                    {
                        verdict: QuestOutcome.failure,
                        aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                    },
                ),
            );
        });
    });

    describe('a story completed by the game master', () => {
        let plan: ParticipantPlan;
        beforeAll(() => {
            plan = planParticipant(
                inputWith({
                    quest: questOf(QuestType.story, TitleType.rookie),
                    lane: QuestLane.story,
                    verdict: QuestOutcome.gmCompleted,
                }),
            );
        });

        it('guards and empties the story lane', () => {
            expect(plan.filter).toEqual({
                _id: CHARACTER_ID,
                deletedAt: null,
                'quests.activeStoryQuest': { $in: idForms(PENDING_ID) },
                'quests.pendingQuest': null,
                'status.xp': 0,
            });
            expect(plan.update.$set['quests.activeStoryQuest']).toBeNull();
            expect(plan.update.$set).not.toHaveProperty([
                'quests.pendingQuest',
            ]);
        });

        it('advances the exact title', () => {
            expect(plan.update.$set['status.title']).toBe(TitleType.adventurer);
            expect(plan.result.outcome).toBe(QuestOutcome.gmCompleted);
            expect(plan.result.titleBefore).toBe(TitleType.rookie);
            expect(plan.result.titleAfter).toBe(TitleType.adventurer);
        });
    });

    it.each([
        ['an ObjectId', QUEST_ID],
        ['a legacy string', QUEST_ID.toHexString()],
    ])('does not complete twice a quest listed as %s', (_label, entry) => {
        const plan = planParticipant(
            inputWith({
                snapshot: snapshotWith({
                    quests: { completedQuests: [entry] },
                }),
            }),
        );

        expect(plan.update.$set).not.toHaveProperty(['quests.completedQuests']);
    });

    it('omits the xp guard when the snapshot has no xp', () => {
        const snapshot = snapshotWith();
        delete snapshot.status.xp;

        const plan = planParticipant(inputWith({ snapshot }));

        expect(plan.filter).not.toHaveProperty(['status.xp']);
        expect(plan.result.xpBefore).toBe(0);
    });

    it('names every rescued character on the rescuer sheet', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.aid),
                rescuedCharacters: [INJURED_ID, OTHER_INJURED_ID],
            }),
        );

        expect(plan.result.rescuedCharacters).toEqual([
            INJURED_ID,
            OTHER_INJURED_ID,
        ]);
    });

    it('names nobody on the sheet of a lost rescue', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.aid),
                verdict: QuestOutcome.failure,
                battle: battleWith({ hpAfter: 300 }),
                aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                rescuedCharacters: [INJURED_ID, OTHER_INJURED_ID],
            }),
        );

        expect(plan.result.rescuedCharacters).toEqual([]);
    });

    describe('the knowledge of a victory', () => {
        const victory = {
            enemyIds: [ENEMY_ID],
            loreIds: [KNOWN_PAGE_ID, NEW_PAGE_ID],
        };
        const enemies = {
            entries: [{ enemy: ENEMY_ID, quantity: 1 }],
            xp: 100,
        };
        const fightWith = (overrides: Partial<ParticipantPlanInput> = {}) =>
            inputWith({
                quest: questOf(QuestType.enemy),
                snapshot: snapshotWith({
                    status: { unlockedLore: [KNOWN_PAGE_ID] },
                }),
                battle: battleWith(),
                enemies,
                ...overrides,
            });

        it('teaches the enemies and their lore to a winner (D-06, D-09)', () => {
            const plan = planParticipant(fightWith({ victory }));
            const untaught = planParticipant(fightWith());

            expect(plan.update.$addToSet).toEqual({
                'status.unlockedLore': { $each: [NEW_PAGE_ID] },
                'status.knownEnemies': { $each: [ENEMY_ID] },
            });
            expect(plan.result.loreUnlocked).toEqual([NEW_PAGE_ID]);
            expect(plan.update.$set).toEqual(untaught.update.$set);
        });

        it('teaches nothing on a defeat (D-06)', () => {
            const plan = planParticipant(
                fightWith({
                    victory,
                    verdict: QuestOutcome.failure,
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );

            expect(Object.keys(plan.update)).toEqual(['$set']);
            expect(plan.result.loreUnlocked).toEqual([]);
        });

        it('teaches a game master completion with enemies like a success (D-06)', () => {
            const plan = planParticipant(
                fightWith({ victory, verdict: QuestOutcome.gmCompleted }),
            );

            expect(plan.update.$addToSet).toEqual({
                'status.unlockedLore': { $each: [NEW_PAGE_ID] },
                'status.knownEnemies': { $each: [ENEMY_ID] },
            });
            expect(plan.result.loreUnlocked).toEqual([NEW_PAGE_ID]);
        });

        it('keeps the filter unchanged when teaching (D-06)', () => {
            expect(planParticipant(fightWith({ victory })).filter).toEqual(
                planParticipant(fightWith()).filter,
            );
        });

        it('writes only the set when the victory is null (D-06, D-14)', () => {
            const plan = planParticipant(fightWith({ victory: null }));

            expect(Object.keys(plan.update)).toEqual(['$set']);
            expect(plan.result.loreUnlocked).toEqual([]);
        });
    });

    describe('the study lore draw', () => {
        const loreDraw = {
            pool: [NEW_PAGE_ID, STUDY_LORE_ID, OTHER_STUDY_LORE_ID],
            chance: 0.5,
            gate: 0.1,
            pick: 0,
        };
        const studyWith = (overrides: Partial<ParticipantPlanInput> = {}) =>
            inputWith({
                quest: questOf(QuestType.study),
                snapshot: snapshotWith({
                    status: { unlockedLore: [KNOWN_PAGE_ID] },
                }),
                rewards: rewardsWith({ xpPrize: 300, loreDraw }),
                ...overrides,
            });

        it('learns a study lore after the enemy lore (D-08, D-09)', () => {
            const plan = planParticipant(
                studyWith({
                    victory: { enemyIds: [ENEMY_ID], loreIds: [NEW_PAGE_ID] },
                }),
            );

            expect(plan.result.loreUnlocked).toEqual([
                NEW_PAGE_ID,
                STUDY_LORE_ID,
            ]);
            expect(plan.update.$addToSet).toEqual({
                'status.unlockedLore': {
                    $each: [NEW_PAGE_ID, STUDY_LORE_ID],
                },
                'status.knownEnemies': { $each: [ENEMY_ID] },
            });
        });

        it('learns a study lore the character does not know (D-08)', () => {
            const plan = planParticipant(
                studyWith({
                    snapshot: snapshotWith({
                        status: { unlockedLore: [NEW_PAGE_ID] },
                    }),
                }),
            );

            expect(plan.result.loreUnlocked).toEqual([STUDY_LORE_ID]);
        });

        it('learns no study lore when a spell is learned (D-08)', () => {
            const plan = planParticipant(
                studyWith({
                    rewards: rewardsWith({
                        xpPrize: 300,
                        loreDraw,
                        spellCandidate: {
                            spellId: LEARNED_SPELL_ID,
                            minXpToLearn: 0,
                            maxUsages: 4,
                        },
                    }),
                }),
            );

            expect(plan.result.spellLearned).toEqual(LEARNED_SPELL_ID);
            expect(plan.result.loreUnlocked).toEqual([]);
            expect(Object.keys(plan.update)).toEqual(['$set']);
        });

        it('learns no study lore on a defeat (D-08)', () => {
            const plan = planParticipant(
                studyWith({
                    verdict: QuestOutcome.failure,
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );

            expect(plan.result.loreUnlocked).toEqual([]);
            expect(Object.keys(plan.update)).toEqual(['$set']);
        });

        it('learns no study lore when the gate fails (D-08)', () => {
            const plan = planParticipant(
                studyWith({
                    rewards: rewardsWith({
                        xpPrize: 300,
                        loreDraw: { ...loreDraw, gate: 0.5 },
                    }),
                }),
            );

            expect(plan.result.loreUnlocked).toEqual([]);
            expect(Object.keys(plan.update)).toEqual(['$set']);
        });
    });
});
