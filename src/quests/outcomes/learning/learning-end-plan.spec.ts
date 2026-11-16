import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { OutcomeCharacterSnapshot } from '../outcome-plan';
import type { SpellCandidate } from '../rewards/quest-rewards';
import {
    type LearningEndInput,
    planLearningEnd,
    researchSheetOf,
    type ResearchSheet,
} from './learning-end-plan';

const NOW = new Date('2026-10-24T12:30:00.000Z');
const CHARACTER_ID = new Types.ObjectId('64b000000000000000000c01');
const PENDING_ID = new Types.ObjectId('64b000000000000000000a01');
const SPELL_ID = new Types.ObjectId('64b000000000000000000501');
const KNOWN_SPELL_ID = new Types.ObjectId('64b000000000000000000502');
const ORIGIN_LORE = new Types.ObjectId('64b0000000000000000000fa');
const OLD_LORE = new Types.ObjectId('64b0000000000000000000fb');
const RESULT_ID = new Types.ObjectId('64b000000000000000000e01');
const USER_ID = new Types.ObjectId('64b000000000000000000d01');
const QUEST_ID = new Types.ObjectId('64b000000000000000000901');

const KNOWN_STATE = {
    spell: KNOWN_SPELL_ID,
    usages: 1,
    recoveries: [],
    active: true,
};

const research: ResearchSheet = {
    user: USER_ID,
    quest: { id: QUEST_ID, type: QuestType.arcane, title: 'Scuola arcana' },
};

const spell: SpellCandidate = {
    spellId: SPELL_ID,
    minLevelToLearn: 6,
    maxUsages: 4,
    relatedLore: [ORIGIN_LORE],
    name: 'Dardo',
    learnTime: 1_800_000,
};

const snapshotWith = (
    status: Partial<OutcomeCharacterSnapshot['status']> = {},
): OutcomeCharacterSnapshot => ({
    _id: CHARACTER_ID,
    status: {
        xp: 4_200,
        level: 7,
        title: TitleType.mage,
        currentLifePoints: 640,
        maxLifePoints: 900,
        spellStates: [KNOWN_STATE],
        unlockedLore: [OLD_LORE],
        ...status,
    },
});

const inputWith = (
    overrides: Partial<LearningEndInput> = {},
): LearningEndInput => ({
    snapshot: snapshotWith(),
    pendingQuestId: PENDING_ID,
    spellId: SPELL_ID,
    spell,
    research,
    resultId: RESULT_ID,
    now: NOW,
    ...overrides,
});

describe('planLearningEnd', () => {
    it('adds the learned spell with full usages, not active, after the known ones (D-26)', () => {
        const plan = planLearningEnd(inputWith());

        expect(plan.learned).toBe(true);
        expect(plan.update.$set['status.spellStates']).toEqual([
            KNOWN_STATE,
            { spell: SPELL_ID, usages: 4, recoveries: [], active: false },
        ]);
    });

    it('frees the standard lane at the end of the learning part (D-26)', () => {
        const plan = planLearningEnd(inputWith());

        expect(plan.update.$set['quests.pendingQuest']).toBeNull();
        expect(plan.filter).toEqual({
            _id: CHARACTER_ID,
            deletedAt: null,
            'quests.pendingQuest': {
                $in: [PENDING_ID, PENDING_ID.toHexString()],
            },
        });
    });

    it('unlocks the spell lore only at the end of the learning part (D-24, D-26)', () => {
        const fresh = planLearningEnd(inputWith());
        const known = planLearningEnd(
            inputWith({
                snapshot: snapshotWith({ unlockedLore: [ORIGIN_LORE] }),
            }),
        );

        expect(fresh.update.$addToSet).toEqual({
            'status.unlockedLore': { $each: [ORIGIN_LORE] },
        });
        expect(known.update.$addToSet).toBeUndefined();
    });

    it('writes a second small sheet for the same quest with the learned spell and its lore (D-31)', () => {
        const plan = planLearningEnd(inputWith());

        expect(plan.result).toEqual({
            _id: RESULT_ID,
            character: CHARACTER_ID,
            user: USER_ID,
            quest: research.quest,
            outcome: QuestOutcome.success,
            resolvedAt: NOW,
            hpBefore: 640,
            hpAfter: 640,
            maxLifePoints: 900,
            injuriesAdded: [],
            injuriesHealed: [],
            consumablesUsed: [],
            spellsUsed: [],
            rewards: {
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [],
                pet: null,
            },
            xpGained: 0,
            petXpGained: 0,
            xpBefore: 4_200,
            xpAfter: 4_200,
            levelBefore: 7,
            levelAfter: 7,
            titleBefore: TitleType.mage,
            titleAfter: TitleType.mage,
            spellLearned: SPELL_ID,
            loreUnlocked: [ORIGIN_LORE],
            enemies: [],
            stagesCleared: null,
            stagesTotal: null,
            turnsTotal: null,
            turnsCompleted: null,
            lastTurn: null,
            lastTurnKind: null,
            rescuedCharacters: [],
            arrested: false,
            coinsLost: null,
            guardEncounter: false,
            companion: null,
            spellFound: null,
            spellResearchFailed: false,
        });
    });

    it('gives no gain on the second sheet (D-31)', () => {
        const result = planLearningEnd(inputWith()).result!;

        expect(result.xpGained).toBe(0);
        expect(result.petXpGained).toBe(0);
        expect(result.rewards).toEqual({
            coins: { gold: 0, silver: 0, copper: 0 },
            items: [],
            pet: null,
        });
        expect(result.enemies).toEqual([]);
        expect(result.consumablesUsed).toEqual([]);
        expect(result.injuriesAdded).toEqual([]);
        expect(result.injuriesHealed).toEqual([]);
        expect([result.hpBefore, result.hpAfter]).toEqual([640, 640]);
        expect([result.xpBefore, result.xpAfter]).toEqual([4_200, 4_200]);
        expect([result.levelBefore, result.levelAfter]).toEqual([7, 7]);
        expect([result.titleBefore, result.titleAfter]).toEqual([
            TitleType.mage,
            TitleType.mage,
        ]);
    });

    it('lists no lore on the second sheet when the origin lore was already unlocked (D-24, D-31)', () => {
        const plan = planLearningEnd(
            inputWith({
                snapshot: snapshotWith({
                    unlockedLore: [OLD_LORE, ORIGIN_LORE],
                }),
            }),
        );

        expect(plan.result?.spellLearned).toBe(SPELL_ID);
        expect(plan.result?.loreUnlocked).toEqual([]);
    });

    it('writes no second sheet when the spell became known during the learning part (D-26, D-31)', () => {
        const alreadyKnown = {
            spell: SPELL_ID.toHexString(),
            usages: 2,
            recoveries: [],
            active: false,
        };
        const plan = planLearningEnd(
            inputWith({
                snapshot: snapshotWith({
                    spellStates: [KNOWN_STATE, alreadyKnown] as never,
                }),
            }),
        );

        expect(plan.learned).toBe(false);
        expect(plan.result).toBeNull();
        expect(plan.update).toEqual({ $set: { 'quests.pendingQuest': null } });
    });

    it('writes no second sheet when the catalogue no longer has the spell (D-26, D-31)', () => {
        const plan = planLearningEnd(inputWith({ spell: null }));

        expect(plan.learned).toBe(false);
        expect(plan.result).toBeNull();
        expect(plan.update).toEqual({ $set: { 'quests.pendingQuest': null } });
    });

    it('learns the spell without a second sheet when the research sheet is unreadable (D-31)', () => {
        const plan = planLearningEnd(inputWith({ research: null }));

        expect(plan.learned).toBe(true);
        expect(plan.result).toBeNull();
        expect(plan.update.$set['status.spellStates']).toHaveLength(2);
        expect(plan.update.$addToSet).toEqual({
            'status.unlockedLore': { $each: [ORIGIN_LORE] },
        });
        expect(plan.update.$set['quests.pendingQuest']).toBeNull();
    });
});

describe('researchSheetOf', () => {
    const questSnapshot = {
        id: QUEST_ID,
        type: QuestType.arcane,
        title: 'Scuola arcana',
    };

    it.each([
        ['null', null],
        ['a string', 'sheet'],
        ['a sheet without a user', { quest: questSnapshot }],
        [
            'a quest snapshot without an id',
            { user: USER_ID, quest: { ...questSnapshot, id: null } },
        ],
        [
            'a quest snapshot without a title',
            { user: USER_ID, quest: { ...questSnapshot, title: undefined } },
        ],
        ['a sheet without a quest snapshot', { user: USER_ID, quest: null }],
    ])(
        'reads a research sheet only with a readable user and quest snapshot (D-31): %s',
        (_case, value) => {
            expect(researchSheetOf(value)).toBeNull();
        },
    );

    it('reads the user and the quest snapshot of a valid research sheet (D-31)', () => {
        expect(
            researchSheetOf({
                _id: RESULT_ID,
                user: USER_ID,
                quest: questSnapshot,
            }),
        ).toEqual({ user: USER_ID, quest: questSnapshot });
    });
});
