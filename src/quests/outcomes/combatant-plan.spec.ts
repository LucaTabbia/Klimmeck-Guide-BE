import { Types } from 'mongoose';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { ChanceSource } from './chance-source';
import type { CombatEnemySnapshot } from './combat/combat-context';
import type { ParticipantEffects } from './combat/combat-resolver';
import type { DungeonResolution } from './dungeon/dungeon-resolver';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
import { SequenceChance } from '../../../test/quests/sequence-chance';
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
import { NO_TURNS } from '../../../test/quests/dungeon-turns.fixture';

const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

const GOBLIN_ID = id('c1');
const CAPO_ID = id('c2');
const COMPANION_ID = id('e1');

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
    },
    quests: { completedQuests: [] },
    assets: { ownedItems: [], ownedEquipments: [] },
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
            stages: { cleared: 3, total: 3, ...NO_TURNS },
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
            stages: { cleared: 1, total: 3, ...NO_TURNS },
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

    it('awards the companion on a won rescue like on any won fight (D-18)', () => {
        const aid: ResolutionQuest = {
            _id: id('93'),
            infos: {
                type: QuestType.aid,
                title: 'Soccorso: Goblin al passo',
                markerLocation: id('83'),
            },
            rescue: { failedQuest: quest._id },
        } as ResolutionQuest;
        const rescuer = {
            ...explorer,
            assets: {
                ...explorer.assets,
                pet: COMPANION_ID,
                ownedPets: [buildOwnedPet(COMPANION_ID, { xp: 5 })],
            },
        } as ResolutionCharacter;

        const { plan, verdict } = planCombatant({
            quest: aid,
            catalog: {
                ...catalogWith([goblins, capo]),
                petMaxXp: new Map([[COMPANION_ID.toHexString(), 1000]]),
            },
            snapshot: rescuer,
            battle: { verdict: 'success', effects: effectsOf(600) },
            resultId: id('d1'),
            aidQuestId: id('d2'),
            pendingQuestId: id('d3'),
            userId: id('d4'),
            chance: new NoDrawChance(),
            rescuedCharacters: [id('a9')],
            now: new Date('2026-11-04T10:00:00.000Z'),
        });

        expect(verdict).toBe(QuestOutcome.success);
        expect(plan.result.rescuedCharacters).toEqual([id('a9')]);
        expect(plan.result.petXpGained).toBe(9);
        expect(plan.update.$set['assets.ownedPets']).toEqual([
            { pet: COMPANION_ID, xp: 14, currentLifePoints: 10 },
        ]);
    });

    it('awards no companion xp to a rescuer who lost the fight (D-18)', () => {
        const rescuer = {
            ...explorer,
            assets: {
                ...explorer.assets,
                pet: COMPANION_ID,
                ownedPets: [buildOwnedPet(COMPANION_ID, { xp: 5 })],
            },
        } as ResolutionCharacter;

        const { plan } = planCombatant({
            quest,
            catalog: {
                ...catalogWith([goblins, capo]),
                petMaxXp: new Map([[COMPANION_ID.toHexString(), 1000]]),
            },
            snapshot: rescuer,
            battle: { verdict: 'failure', effects: effectsOf(0) },
            resultId: id('d1'),
            aidQuestId: id('d2'),
            pendingQuestId: id('d3'),
            userId: id('d4'),
            chance: new NoDrawChance(),
            now: new Date('2026-11-04T10:00:00.000Z'),
        });

        expect(plan.result.petXpGained).toBe(0);
        expect(Object.keys(plan.update.$set)).not.toContain('assets.ownedPets');
    });
});

const questOfType = (type: QuestType, hex: string): ResolutionQuest => ({
    _id: id(hex),
    infos: { type, title: 'Quest persa', markerLocation: id('86') },
});

const lostBy = (lost: ResolutionQuest) =>
    planWith(lost, { verdict: 'failure', effects: effectsOf(0) });

describe('planCombatant defeat by quest type', () => {
    it('opens an aid for a lost hunt (D-09)', () => {
        const { aid } = lostBy(questOfType(QuestType.hunt, '96'));

        expect(aid).toEqual({ aidQuestId: id('d2'), failedQuestId: id('96') });
    });

    it.each([
        QuestType.heal,
        QuestType.job,
        QuestType.study,
        QuestType.magic,
        QuestType.crime,
        QuestType.guard,
    ])(
        'concludes a lost job without aid at one life point (D-19): %s',
        (type) => {
            const { plan, verdict, aid } = lostBy(questOfType(type, '97'));

            expect(aid).toBeNull();
            expect(verdict).toBe(QuestOutcome.failure);
            expect(plan.update.$set['status.currentLifePoints']).toBe(1);
            expect(Object.keys(plan.update.$set)).not.toContain(
                'status.awaitingAid',
            );
            expect(plan.result.guardEncounter).toBe(false);
        },
    );

    it('keeps the aid of a lost boss and of a lost aid (D-09, D-10)', () => {
        const failedQuest = id('9a');
        const lostAid = {
            ...questOfType(QuestType.aid, '99'),
            rescue: { failedQuest },
        } as ResolutionQuest;

        expect(lostBy(questOfType(QuestType.boss, '98')).aid).toEqual({
            aidQuestId: id('d2'),
            failedQuestId: id('98'),
        });
        expect(lostBy(lostAid).aid).toEqual({
            aidQuestId: id('d2'),
            failedQuestId: failedQuest,
        });
    });
});

const winnerWithTitle = (title: TitleType): ResolutionCharacter =>
    ({
        ...explorer,
        status: { ...explorer.status, title },
    }) as ResolutionCharacter;

const planWonBy = (quest: ResolutionQuest, title: TitleType) =>
    planCombatant({
        quest,
        catalog: catalogWith([]),
        snapshot: winnerWithTitle(title),
        battle: null,
        resultId: id('d1'),
        aidQuestId: id('d2'),
        pendingQuestId: id('d3'),
        userId: id('d4'),
        chance: new NoDrawChance(),
        now: new Date('2026-11-04T10:00:00.000Z'),
    });

describe('planCombatant prize block', () => {
    it('draws the rewards from the block of the character title (D-04, D-05)', () => {
        const boss: ResolutionQuest = {
            _id: id('94'),
            infos: {
                type: QuestType.boss,
                title: 'Il drago di Bosa',
                markerLocation: id('84'),
            },
            requirements: { minTitle: TitleType.paladin },
            prizes: {
                xpPrize: 300,
                rankPrizes: [
                    { title: TitleType.mage, xpPrize: 300 },
                    { title: TitleType.paladin, xpPrize: 120 },
                ],
            },
        };

        const { plan } = planWonBy(boss, TitleType.paladin);

        expect(plan.result.xpGained).toBe(120);
    });

    it('draws the minimum title prize of a solo quest for any title (D-01)', () => {
        const hunt: ResolutionQuest = {
            _id: id('95'),
            infos: {
                type: QuestType.hunt,
                title: 'La caccia al cinghiale',
                markerLocation: id('85'),
            },
            requirements: { minTitle: TitleType.rookie },
            prizes: {
                xpPrize: 40,
                rankPrizes: [{ title: TitleType.mage, xpPrize: 300 }],
            },
        };

        const { plan } = planWonBy(hunt, TitleType.mage);

        expect(plan.result.xpGained).toBe(40);
    });
});

describe('planCombatant rescue share', () => {
    const PET_ID = id('e2');
    const dungeonAid = (
        rescue: ResolutionQuest['rescue'],
    ): ResolutionQuest => ({
        _id: id('96'),
        infos: {
            type: QuestType.aid,
            title: 'Soccorso: Le cripte di Bosa',
            markerLocation: id('86'),
        },
        prizes: { xpPrize: 25, pet: PET_ID },
        rescue,
    });
    const petCatalog = (): ResolutionCatalog => {
        const catalog = catalogWith([]);
        return {
            ...catalog,
            rewards: {
                ...catalog.rewards,
                pets: new Map([[PET_ID.toHexString(), 450]]),
            },
        };
    };
    const rescuedWith = (aid: ResolutionQuest, chance: SequenceChance) =>
        planCombatant({
            quest: aid,
            catalog: petCatalog(),
            snapshot: explorer,
            battle: null,
            resultId: id('d1'),
            aidQuestId: id('d2'),
            pendingQuestId: id('d3'),
            userId: id('d4'),
            chance,
            now: new Date('2026-11-04T10:00:00.000Z'),
        });

    // la soglia del loot scalata è provata da cascading-loot.spec e da dungeon-aid.int-spec
    it('scales the pet chance of a dungeon aid rescuer (D-20)', () => {
        const shared = new SequenceChance([0.15]);
        const whole = new SequenceChance([0.15]);
        const failedQuest = id('92');

        const sharedPlan = rescuedWith(
            dungeonAid({
                failedQuest,
                turn: { index: 3, kind: DungeonTurnKind.fight, total: 8 },
            }),
            shared,
        );
        const wholePlan = rescuedWith(dungeonAid({ failedQuest }), whole);

        expect(sharedPlan.plan.result.rewards.pet).toBeNull();
        expect(wholePlan.plan.result.rewards.pet).toEqual(PET_ID);
        expect(shared.drawn).toEqual(whole.drawn);
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
                    turnsTotal: 8,
                    turnsCompleted: 5,
                    failedTurn: { index: 5, kind: DungeonTurnKind.fight },
                },
                explorer._id,
            ),
        ).toEqual({
            verdict: 'failure',
            effects,
            stages: {
                cleared: 2,
                total: 4,
                turnsTotal: 8,
                turnsCompleted: 5,
                lastTurn: 6,
                lastTurnKind: DungeonTurnKind.fight,
            },
        });
    });

    it('carries the turn counters of a dungeon battle (D-21)', () => {
        const effects = effectsOf(400);
        const stagesOf = (
            resolution: Omit<DungeonResolution, 'participants'>,
        ) =>
            dungeonBattleOf(
                { ...resolution, participants: [effects] },
                explorer._id,
            ).stages;

        expect(
            stagesOf({
                verdict: 'success',
                stagesCleared: 2,
                stagesTotal: 4,
                turnsTotal: 8,
                turnsCompleted: 5,
                failedTurn: null,
            }),
        ).toEqual({
            cleared: 2,
            total: 4,
            turnsTotal: 8,
            turnsCompleted: 5,
            lastTurn: 5,
            lastTurnKind: DungeonTurnKind.exploration,
        });
        expect(
            stagesOf({
                verdict: 'failure',
                stagesCleared: 1,
                stagesTotal: 4,
                turnsTotal: 8,
                turnsCompleted: 3,
                failedTurn: { index: 3, kind: DungeonTurnKind.fight },
            }),
        ).toEqual({
            cleared: 1,
            total: 4,
            turnsTotal: 8,
            turnsCompleted: 3,
            lastTurn: 4,
            lastTurnKind: DungeonTurnKind.fight,
        });
    });
});
