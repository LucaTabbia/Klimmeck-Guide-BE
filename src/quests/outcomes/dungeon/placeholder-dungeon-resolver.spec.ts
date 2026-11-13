import { EffectType } from 'src/models/enums/effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { SequenceChance } from '../../../../test/quests/sequence-chance';
import { TurnFailingDungeonResolver } from '../../../../test/quests/turn-failing-dungeon-resolver';
import {
    CombatContext,
    CombatEnemy,
    CombatParticipant,
    CombatResolution,
    CombatResolver,
    CombatVerdict,
    ParticipantEffects,
} from '../combat/combat-resolver';
import { DungeonContext, DungeonResolution } from './dungeon-resolver';
import { PlaceholderDungeonResolver } from './placeholder-dungeon-resolver';

type StageEffects = Partial<Omit<ParticipantEffects, 'characterId'>>;

interface StageScript {
    verdict: CombatVerdict;
    effects?: Record<string, StageEffects>;
}

// CombatResolver finto: una risposta per tappa, un tiro per tappa per contare i tiri della dungeon
class StagedCombatResolver extends CombatResolver {
    readonly contexts: CombatContext[] = [];

    constructor(private readonly stages: readonly StageScript[]) {
        super();
    }

    resolve(context: CombatContext, chance: ChanceSource): CombatResolution {
        chance.next();
        const stage = this.stages[this.contexts.length] ?? {
            verdict: 'success',
        };
        this.contexts.push(context);
        return {
            verdict: stage.verdict,
            participants: context.participants.map((participant) => {
                const script = stage.effects?.[participant.characterId] ?? {};
                return {
                    characterId: participant.characterId,
                    hpAfter: script.hpAfter ?? participant.currentLifePoints,
                    injuriesAdded: script.injuriesAdded ?? [],
                    consumablesUsed: script.consumablesUsed ?? [],
                    spellsUsed: script.spellsUsed ?? [],
                };
            }),
        };
    }
}

const HERO = 'a1'.padStart(24, '0');
const MAGE = 'a2'.padStart(24, '0');
const POTION = '71'.padStart(24, '0');
const FIREBALL = '51'.padStart(24, '0');

const enemy = (name: string, quantity = 1): CombatEnemy => ({
    id: name,
    name,
    lifePoints: 100,
    xp: 20,
    damages: { base: [], energy: [] },
    weaknesses: { base: [], energy: [] },
    quantity,
});

const participant = (characterId: string): CombatParticipant => ({
    characterId,
    title: TitleType.adventurer,
    level: 2,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    injuries: [InjuryType.deepCut],
    equipment: [],
    activeSpells: [{ spellId: FIREBALL, usages: 2, damage: null }],
    consumables: [
        { itemId: POTION, quantity: 1, effect: EffectType.heal, power: 300 },
    ],
});

const dungeon = (): DungeonContext => ({
    quest: { id: 'q1', type: QuestType.dungeon, title: 'Cripta' },
    enemies: [enemy('Goblin', 3), enemy('Troll'), enemy('Capo goblin')],
    participants: [participant(MAGE), participant(HERO)],
    recommendedLoot: [],
    recommendedOwned: {},
});

const explore = (
    stages: readonly StageScript[],
    chance = new SequenceChance(),
    context = dungeon(),
) => {
    const combat = new StagedCombatResolver(stages);
    const resolution = new PlaceholderDungeonResolver(combat).explore(
        context,
        chance,
    );
    return { combat, resolution, chance };
};

const countersOf = (resolution: DungeonResolution) => ({
    verdict: resolution.verdict,
    turnsTotal: resolution.turnsTotal,
    turnsCompleted: resolution.turnsCompleted,
    failedTurn: resolution.failedTurn,
    stagesCleared: resolution.stagesCleared,
    stagesTotal: resolution.stagesTotal,
});

describe('PlaceholderDungeonResolver', () => {
    it('resolves one stage per enemy entry in order (D-12)', () => {
        const { combat } = explore([]);

        expect(combat.contexts.map((context) => context.enemies)).toEqual([
            [enemy('Goblin', 3)],
            [enemy('Troll')],
            [enemy('Capo goblin')],
        ]);
        expect(combat.contexts.map((context) => context.quest)).toEqual([
            dungeon().quest,
            dungeon().quest,
            dungeon().quest,
        ]);
    });

    it('starts each stage from the hp, wounds, consumables and spell usages left by the previous one (D-12)', () => {
        const { combat } = explore([
            {
                verdict: 'success',
                effects: {
                    [HERO]: {
                        hpAfter: 700,
                        injuriesAdded: [InjuryType.brokenLeftArm],
                        consumablesUsed: [{ itemId: POTION, quantity: 1 }],
                        spellsUsed: [{ spellId: FIREBALL, usages: 1 }],
                    },
                },
            },
            {
                verdict: 'success',
                effects: {
                    [HERO]: {
                        consumablesUsed: [{ itemId: POTION, quantity: 1 }],
                        spellsUsed: [{ spellId: FIREBALL, usages: 5 }],
                    },
                },
            },
        ]);

        const hero = (stage: number) =>
            combat.contexts[stage].participants.find(
                (entry) => entry.characterId === HERO,
            );
        expect(hero(1)).toEqual({
            ...participant(HERO),
            currentLifePoints: 700,
            injuries: [InjuryType.deepCut, InjuryType.brokenLeftArm],
            activeSpells: [{ spellId: FIREBALL, usages: 1, damage: null }],
            consumables: [
                {
                    itemId: POTION,
                    quantity: 0,
                    effect: EffectType.heal,
                    power: 300,
                },
            ],
        });
        expect(hero(2)?.consumables[0].quantity).toBe(0);
        expect(hero(2)?.activeSpells[0].usages).toBe(0);
        expect(
            combat.contexts[1].participants.find(
                (entry) => entry.characterId === MAGE,
            ),
        ).toEqual(participant(MAGE));
    });

    it('stops at the first defeat with the stages cleared so far (D-12)', () => {
        const { combat, resolution } = explore([
            { verdict: 'success' },
            { verdict: 'failure' },
            { verdict: 'success' },
        ]);

        expect(combat.contexts).toHaveLength(2);
        expect({
            verdict: resolution.verdict,
            stagesCleared: resolution.stagesCleared,
            stagesTotal: resolution.stagesTotal,
        }).toEqual({ verdict: 'failure', stagesCleared: 1, stagesTotal: 3 });
    });

    it('clears every stage on a full victory (D-12)', () => {
        const { combat, resolution } = explore([]);

        expect(combat.contexts).toHaveLength(3);
        expect({
            verdict: resolution.verdict,
            stagesCleared: resolution.stagesCleared,
            stagesTotal: resolution.stagesTotal,
        }).toEqual({ verdict: 'success', stagesCleared: 3, stagesTotal: 3 });
    });

    it('merges the effects of the stages per participant (D-12)', () => {
        const { resolution } = explore([
            {
                verdict: 'success',
                effects: {
                    [HERO]: {
                        hpAfter: 800,
                        injuriesAdded: [InjuryType.brokenLeftArm],
                        consumablesUsed: [{ itemId: POTION, quantity: 1 }],
                        spellsUsed: [{ spellId: FIREBALL, usages: 1 }],
                    },
                },
            },
            {
                verdict: 'success',
                effects: {
                    [HERO]: {
                        hpAfter: 600,
                        injuriesAdded: [
                            InjuryType.brokenLeftArm,
                            InjuryType.brokenLeftLeg,
                        ],
                        spellsUsed: [{ spellId: FIREBALL, usages: 1 }],
                    },
                    [MAGE]: { hpAfter: 400 },
                },
            },
            { verdict: 'failure', effects: { [HERO]: { hpAfter: 300 } } },
        ]);

        expect(resolution.participants).toEqual([
            {
                characterId: HERO,
                hpAfter: 300,
                injuriesAdded: [
                    InjuryType.brokenLeftArm,
                    InjuryType.brokenLeftLeg,
                ],
                consumablesUsed: [{ itemId: POTION, quantity: 1 }],
                spellsUsed: [{ spellId: FIREBALL, usages: 2 }],
            },
            {
                characterId: MAGE,
                hpAfter: 400,
                injuriesAdded: [],
                consumablesUsed: [],
                spellsUsed: [],
            },
        ]);
    });

    it('adds no chance draw of its own (D-10)', () => {
        const { combat, chance } = explore(
            [{ verdict: 'success' }, { verdict: 'failure' }],
            new SequenceChance([0.1, 0.2, 0.3]),
        );

        expect(chance.drawn).toEqual([0.1, 0.2]);
        expect(combat.contexts).toHaveLength(2);
    });

    it('succeeds without stages when the dungeon has no enemies (D-12)', () => {
        const combat = new StagedCombatResolver([]);
        const resolution = new PlaceholderDungeonResolver(combat).explore(
            { ...dungeon(), enemies: [] },
            new SequenceChance(),
        );

        expect(resolution).toEqual({
            verdict: 'success',
            participants: [],
            stagesCleared: 0,
            stagesTotal: 0,
            turnsTotal: 0,
            turnsCompleted: 0,
            failedTurn: null,
        });
        expect(combat.contexts).toHaveLength(0);
    });

    it('passes every exploration without drawing (D-29)', () => {
        const { combat, resolution, chance } = explore(
            [],
            new SequenceChance([0.1, 0.2, 0.3, 0.4]),
        );

        expect(chance.drawn).toEqual([0.1, 0.2, 0.3]);
        expect(combat.contexts).toHaveLength(3);
        expect(countersOf(resolution)).toEqual({
            verdict: 'success',
            turnsTotal: 6,
            turnsCompleted: 6,
            failedTurn: null,
            stagesCleared: 3,
            stagesTotal: 3,
        });
    });

    it('stops on the fight it loses and names the turn (D-12, D-13)', () => {
        const { combat, resolution } = explore([
            { verdict: 'success' },
            { verdict: 'failure' },
        ]);

        expect(combat.contexts).toHaveLength(2);
        expect(countersOf(resolution)).toEqual({
            verdict: 'failure',
            turnsTotal: 6,
            turnsCompleted: 3,
            failedTurn: { index: 3, kind: DungeonTurnKind.fight },
            stagesCleared: 1,
            stagesTotal: 3,
        });
    });

    it('plays the turns up to the last one asked (D-13)', () => {
        const { combat, resolution } = explore([], new SequenceChance(), {
            ...dungeon(),
            enemies: [...dungeon().enemies, enemy('Drago')],
            lastTurnIndex: 4,
        });

        expect(combat.contexts.map((context) => context.enemies)).toEqual([
            [enemy('Goblin', 3)],
            [enemy('Troll')],
        ]);
        expect(countersOf(resolution)).toEqual({
            verdict: 'success',
            turnsTotal: 8,
            turnsCompleted: 5,
            failedTurn: null,
            stagesCleared: 2,
            stagesTotal: 4,
        });
    });
});

describe('TurnFailingDungeonResolver', () => {
    it('loses on a chosen exploration turn, then delegates to the placeholder (D-13, D-29)', () => {
        const combat = new StagedCombatResolver([
            { verdict: 'success', effects: { [HERO]: { hpAfter: 700 } } },
        ]);
        const port = new TurnFailingDungeonResolver(
            new PlaceholderDungeonResolver(combat),
            [4],
        );

        const lost = port.explore(dungeon(), new SequenceChance());
        const cleared = port.explore(dungeon(), new SequenceChance());

        expect(countersOf(lost)).toEqual({
            verdict: 'failure',
            turnsTotal: 6,
            turnsCompleted: 4,
            failedTurn: { index: 4, kind: DungeonTurnKind.exploration },
            stagesCleared: 2,
            stagesTotal: 3,
        });
        expect(lost.participants.map((effects) => effects.hpAfter)).toEqual([
            700, 1000,
        ]);
        expect(countersOf(cleared)).toEqual({
            verdict: 'success',
            turnsTotal: 6,
            turnsCompleted: 6,
            failedTurn: null,
            stagesCleared: 3,
            stagesTotal: 3,
        });
        expect(combat.contexts).toHaveLength(5);
    });
});
