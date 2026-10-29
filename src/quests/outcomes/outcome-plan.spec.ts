import { Types } from 'mongoose';
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
} from 'src/quests/outcomes/outcome-plan';
import {
    DrawnRewards,
    NO_REWARDS,
} from 'src/quests/outcomes/rewards/quest-rewards';

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
        spells: [],
        ...overrides.status,
    },
    quests: overrides.quests ?? { completedQuests: [] },
    assets: overrides.assets ?? {
        ownedItems: [],
        ownedEquipments: [],
        activeSpells: [],
    },
});

const questOf = (
    type: QuestType,
    minTitle: TitleType | null = null,
): OutcomeQuestSnapshot => ({
    _id: QUEST_ID,
    infos: { type, title: 'La quest di prova' },
    requirements: { minTitle },
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
    enemy: null,
    rewards: NO_REWARDS,
    aid: null,
    spellRecoveryTimes: new Map(),
    spellMaxUsages: new Map(),
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
                'status.spells',
                'status.spellStates',
                'assets.activeSpells',
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
                consumablesUsed: [],
                spellsUsed: [],
                rewards: {
                    coins: { gold: 0, silver: 1, copper: 50 },
                    items: [potionStack(2)],
                },
                xpGained: 300,
                xpBefore: 0,
                xpAfter: 300,
                levelBefore: 1,
                levelAfter: 2,
                titleBefore: TitleType.rookie,
                titleAfter: TitleType.rookie,
                spellLearned: null,
                enemy: null,
                rescuedCharacters: [],
            });
        });
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

    it('adds the defeated enemy xp to the prize and keeps the fight hp', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.enemy),
                battle: battleWith({ hpAfter: 700 }),
                enemy: { id: ENEMY_ID, xp: 100 },
                rewards: rewardsWith({ xpPrize: 50 }),
            }),
        );

        expect(plan.result.xpGained).toBe(150);
        expect(plan.result.hpAfter).toBe(700);
        expect(plan.update.$set['status.currentLifePoints']).toBe(700);
        expect(plan.result.enemy).toBe(ENEMY_ID);
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
                    enemy: { id: ENEMY_ID, xp: 100 },
                    rewards: rewardsWith({ coinsCopper: 150, xpPrize: 300 }),
                    aid: { aidQuestId: AID_ID, failedQuestId: FAILED_ID },
                }),
            );
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

    it('heals every injury and restores the new maximum on a won heal', () => {
        const plan = planParticipant(
            inputWith({
                quest: questOf(QuestType.heal),
                snapshot: snapshotWith({
                    status: {
                        currentLifePoints: 400,
                        injuries: [InjuryType.deepCut],
                    },
                }),
                rewards: rewardsWith({ xpPrize: 300 }),
            }),
        );

        expect(plan.update.$set['status.injuries']).toEqual([]);
        expect(plan.update.$set['status.currentLifePoints']).toBe(1200);
        expect(plan.result.hpAfter).toBe(1200);
        expect(plan.result.injuriesAdded).toEqual([]);
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
                            activeSpells: [],
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
        const slotsWith = (
            activeSpells: { spell: unknown; usages: number }[],
        ) => ({
            ownedItems: [],
            ownedEquipments: [],
            activeSpells,
        });
        const knowingSpell = (
            usages: number,
            recoveries: Date[] = [],
            activeSpells: { spell: unknown; usages: number }[] = [
                { spell: SPELL_ID, usages },
            ],
        ): SnapshotOverrides => ({
            status: {
                spells: [SPELL_ID],
                spellStates: [{ spell: SPELL_ID, usages, recoveries }],
            },
            assets: slotsWith(activeSpells),
        });
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
                { spell: SPELL_ID, usages: 1, recoveries: [DUE, DUE, LATER] },
            ]);
            expect(plan.update.$set['assets.activeSpells']).toEqual([
                { spell: SPELL_ID, usages: 1 },
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
                { spell: SPELL_ID, usages: 0, recoveries: [DUE, DUE] },
            ]);
            expect(plan.update.$set['assets.activeSpells']).toEqual([
                { spell: SPELL_ID, usages: 0 },
            ]);
            expect(plan.result.spellsUsed).toEqual([
                { spell: SPELL_ID, usages: 2 },
            ]);
            expect(plan.spellRecoveries).toEqual([triggerOf()]);
        });

        it('takes the usages from the spell state, never from the slots', () => {
            const plan = fightWith(
                knowingSpell(
                    1,
                    [LATER, LATER],
                    [{ spell: SPELL_ID, usages: 3 }],
                ),
                using(2),
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 0, recoveries: [DUE, LATER, LATER] },
            ]);
            expect(plan.result.spellsUsed).toEqual([
                { spell: SPELL_ID, usages: 1 },
            ]);
        });

        it('spends nothing from a spell known but not in the slots', () => {
            const plan = fightWith(knowingSpell(2, [], []), using(1));

            const keys = Object.keys(plan.update.$set);
            expect(keys).not.toContain('status.spellStates');
            expect(keys).not.toContain('assets.activeSpells');
            expect(plan.result.spellsUsed).toEqual([]);
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('ignores a spell that is not active', () => {
            const plan = fightWith(knowingSpell(2), using(1, OTHER_SPELL_ID));

            const keys = Object.keys(plan.update.$set);
            expect(keys).not.toContain('status.spellStates');
            expect(keys).not.toContain('assets.activeSpells');
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('spends a spell with no known recovery time without an instant or a trigger', () => {
            const plan = fightWith(knowingSpell(2), using(1), {
                spellRecoveryTimes: new Map(),
            });

            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 1, recoveries: [] },
            ]);
            expect(plan.update.$set['assets.activeSpells']).toEqual([
                { spell: SPELL_ID, usages: 1 },
            ]);
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('writes neither the spell state nor the slots when no spell is used', () => {
            const plan = fightWith(knowingSpell(2), []);

            const keys = Object.keys(plan.update.$set);
            expect(keys).not.toContain('status.spellStates');
            expect(keys).not.toContain('assets.activeSpells');
            expect(plan.spellRecoveries).toEqual([]);
        });

        it('keeps the slot reference in its stored legacy form', () => {
            const plan = fightWith(
                knowingSpell(
                    2,
                    [],
                    [{ spell: SPELL_ID.toHexString(), usages: 2 }],
                ),
                using(1),
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 1, recoveries: [DUE] },
            ]);
            expect(plan.update.$set['assets.activeSpells']).toEqual([
                { spell: SPELL_ID.toHexString(), usages: 1 },
            ]);
            expect(plan.spellRecoveries).toEqual([triggerOf()]);
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

            expect(plan.update.$set['status.spells']).toEqual([
                SPELL_ID,
                LEARNED_SPELL_ID,
            ]);
            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 1, recoveries: [DUE] },
                { spell: LEARNED_SPELL_ID, usages: 4, recoveries: [] },
            ]);
            expect(plan.update.$set['assets.activeSpells']).toEqual([
                { spell: SPELL_ID, usages: 1 },
            ]);
        });

        it('spends on the whole migrated spell state for a character not migrated yet', () => {
            const plan = fightWith(
                {
                    status: { spells: [SPELL_ID, OTHER_SPELL_ID] },
                    assets: slotsWith([{ spell: SPELL_ID, usages: 2 }]),
                },
                using(1),
                {
                    spellMaxUsages: new Map([
                        [SPELL_ID.toHexString(), 3],
                        [OTHER_SPELL_ID.toHexString(), 2],
                    ]),
                },
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 1, recoveries: [DUE] },
                { spell: OTHER_SPELL_ID, usages: 2, recoveries: [] },
            ]);
            expect(plan.update.$set['assets.activeSpells']).toEqual([
                { spell: SPELL_ID, usages: 1 },
            ]);
            expect(plan.spellRecoveries).toEqual([triggerOf()]);
        });

        it('leaves the snapshot spell state untouched', () => {
            const snapshot = knowingSpell(2);

            fightWith(snapshot, using(1));

            expect(snapshot.status?.spellStates).toEqual([
                { spell: SPELL_ID, usages: 2, recoveries: [] },
            ]);
        });
    });

    describe('spell learning on a won study', () => {
        const RECOVERY_AT = new Date('2026-10-24T11:00:00.000Z');
        const learnedState = {
            spell: LEARNED_SPELL_ID,
            usages: 4,
            recoveries: [],
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
            const keys = Object.keys(plan.update.$set);
            expect(keys).not.toContain('status.spells');
            expect(keys).not.toContain('status.spellStates');
            expect(plan.result.spellLearned).toBeNull();
        };

        it('learns the spell with a full spell state in the same $set', () => {
            const known = {
                spell: SPELL_ID,
                usages: 1,
                recoveries: [RECOVERY_AT],
            };
            const snapshot = {
                status: { spells: [SPELL_ID], spellStates: [known] },
            };

            const plan = studyWith(300, snapshot);

            expect(plan.update.$set['status.spells']).toEqual([
                SPELL_ID,
                LEARNED_SPELL_ID,
            ]);
            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 1, recoveries: [RECOVERY_AT] },
                learnedState,
            ]);
            expect(plan.result.spellLearned).toBe(LEARNED_SPELL_ID);
            expect(snapshot.status.spellStates).toEqual([known]);
        });

        it('writes the whole migrated spell state for a character not migrated yet', () => {
            const plan = studyWith(
                300,
                {
                    status: { spells: [SPELL_ID, OTHER_SPELL_ID] },
                    assets: {
                        ownedItems: [],
                        ownedEquipments: [],
                        activeSpells: [{ spell: SPELL_ID, usages: 1 }],
                    },
                },
                {
                    spellMaxUsages: new Map([
                        [SPELL_ID.toHexString(), 3],
                        [OTHER_SPELL_ID.toHexString(), 2],
                    ]),
                },
            );

            expect(plan.update.$set['status.spellStates']).toEqual([
                { spell: SPELL_ID, usages: 1, recoveries: [] },
                { spell: OTHER_SPELL_ID, usages: 2, recoveries: [] },
                learnedState,
            ]);
        });

        it('only grants xp when the xp is not enough', () => {
            expectNothingLearned(studyWith(400));
        });

        it('does not learn a spell already known as a legacy string', () => {
            expectNothingLearned(
                studyWith(300, {
                    status: { spells: [LEARNED_SPELL_ID.toHexString()] },
                }),
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
});
