import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { ChanceSource } from './chance-source';
import type { CombatEnemySnapshot } from './combat/combat-context';
import type { ParticipantEffects } from './combat/combat-resolver';
import {
    type CombatantBattle,
    combatContextOf,
    dungeonBattleOf,
    enemyFactsOf,
    planCombatant,
} from './combatant-plan';
import type {
    ResolutionCatalog,
    ResolutionCharacter,
    ResolutionQuest,
} from './resolution-loader.service';

const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

const GOBLIN_ID = id('c1');
const CAPO_ID = id('c2');

const quest: ResolutionQuest = {
    _id: id('91'),
    infos: {
        type: QuestType.enemy,
        title: 'Goblin al passo',
        markerLocation: id('81'),
    },
};

const hero: ResolutionCharacter = {
    _id: id('a1'),
    status: { title: TitleType.rookie },
    assets: null,
} as ResolutionCharacter;

const catalogWith = (
    enemies: { snapshot: CombatEnemySnapshot; quantity: number }[],
): ResolutionCatalog => ({
    enemies,
    rewards: {
        rarities: new Map(),
        spells: new Map(),
        spellPool: [],
        pets: new Map(),
    },
    equipment: new Map(),
    spells: new Map(),
    loot: new Map(),
    recoveryTimes: new Map(),
    spellMaxUsages: new Map(),
    petMaxXp: new Map(),
});

const goblins = { snapshot: { _id: GOBLIN_ID, xp: 10 }, quantity: 3 };
const capo = { snapshot: { _id: CAPO_ID, xp: 63 }, quantity: 1 };

describe('combatContextOf', () => {
    it('returns no combat context without valid enemies (D-02)', () => {
        expect(combatContextOf(quest, catalogWith([]), [hero])).toBeNull();
    });

    it('builds the context with every enemy and its quantity (D-02)', () => {
        const context = combatContextOf(quest, catalogWith([goblins, capo]), [
            hero,
        ]);

        expect(
            context?.enemies.map(({ id: enemyId, quantity }) => ({
                enemyId,
                quantity,
            })),
        ).toEqual([
            { enemyId: GOBLIN_ID.toHexString(), quantity: 3 },
            { enemyId: CAPO_ID.toHexString(), quantity: 1 },
        ]);
    });
});

describe('enemyFactsOf', () => {
    it('sums the enemy xp by quantity (D-02)', () => {
        expect(enemyFactsOf(catalogWith([goblins, capo]))).toEqual({
            entries: [
                { enemy: GOBLIN_ID, quantity: 3 },
                { enemy: CAPO_ID, quantity: 1 },
            ],
            xp: 93,
        });
    });

    it('counts a non numeric enemy xp as 0 (D-02)', () => {
        const broken = {
            snapshot: { _id: GOBLIN_ID, xp: Number.NaN },
            quantity: 2,
        };
        const unknown = { snapshot: { _id: CAPO_ID }, quantity: 1 };

        expect(enemyFactsOf(catalogWith([broken, unknown]))).toEqual({
            entries: [
                { enemy: GOBLIN_ID, quantity: 2 },
                { enemy: CAPO_ID, quantity: 1 },
            ],
            xp: 0,
        });
    });

    it('returns no enemy facts for an empty catalog (D-02)', () => {
        expect(enemyFactsOf(catalogWith([]))).toBeNull();
    });
});

class NoDrawChance extends ChanceSource {
    next(): number {
        return 0.99;
    }
}

const dungeon: ResolutionQuest = {
    _id: id('92'),
    infos: {
        type: QuestType.dungeon,
        title: 'Le cripte di Bosa',
        markerLocation: id('82'),
    },
    prizes: { prizeCoins: { silver: 2 }, xpPrize: 50 },
};

const explorer: ResolutionCharacter = {
    _id: id('a2'),
    status: {
        xp: 0,
        level: 1,
        title: TitleType.rookie,
        currentLifePoints: 1000,
        maxLifePoints: 1000,
        injuries: [],
        spells: [],
    },
    quests: { completedQuests: [] },
    assets: { ownedItems: [], ownedEquipments: [], activeSpells: [] },
} as ResolutionCharacter;

const effectsOf = (hpAfter: number): ParticipantEffects => ({
    characterId: explorer._id.toHexString(),
    hpAfter,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
});

const planWith = (quest: ResolutionQuest, battle: CombatantBattle) =>
    planCombatant({
        quest,
        catalog: catalogWith([goblins]),
        snapshot: explorer,
        battle,
        resultId: id('d1'),
        aidQuestId: id('d2'),
        pendingQuestId: id('d3'),
        userId: id('d4'),
        chance: new NoDrawChance(),
        now: new Date('2026-11-04T10:00:00.000Z'),
    });

describe('planCombatant', () => {
    it('carries the dungeon stages into the participant result (D-12)', () => {
        const { plan, verdict } = planWith(dungeon, {
            verdict: 'success',
            effects: effectsOf(700),
            stages: { cleared: 3, total: 3 },
        });

        expect(verdict).toBe(QuestOutcome.success);
        expect(plan.result.stagesCleared).toBe(3);
        expect(plan.result.stagesTotal).toBe(3);
        expect(plan.coinsDelta).toBe(200);
    });

    it('withholds the rewards and keeps the cleared stages on a defeat (D-12)', () => {
        const { plan, verdict, aid } = planWith(dungeon, {
            verdict: 'failure',
            effects: effectsOf(0),
            stages: { cleared: 1, total: 3 },
        });

        expect(verdict).toBe(QuestOutcome.failure);
        expect(plan.result.stagesCleared).toBe(1);
        expect(plan.result.stagesTotal).toBe(3);
        expect(plan.result.rewards).toEqual({
            coins: { gold: 0, silver: 0, copper: 0 },
            items: [],
            pet: null,
        });
        expect(plan.coinsDelta).toBe(0);
        expect(aid).toEqual({ aidQuestId: id('d2'), failedQuestId: id('92') });
    });

    it('leaves the stages null outside a dungeon (D-12)', () => {
        const { plan } = planWith(quest, {
            verdict: 'success',
            effects: effectsOf(900),
        });

        expect(plan.result.stagesCleared).toBeNull();
        expect(plan.result.stagesTotal).toBeNull();
    });
});

describe('dungeonBattleOf', () => {
    it('reads the verdict, the effects and the stages of the exploration (D-12)', () => {
        const effects = effectsOf(400);

        expect(
            dungeonBattleOf(
                {
                    verdict: 'failure',
                    participants: [effects],
                    stagesCleared: 2,
                    stagesTotal: 4,
                },
                explorer._id,
            ),
        ).toEqual({
            verdict: 'failure',
            effects,
            stages: { cleared: 2, total: 4 },
        });
    });
});
