import { EffectType } from 'src/models/enums/effect-type.enum';
import { EquipType } from 'src/models/enums/equip-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SlotType } from 'src/models/enums/slot-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { SequenceChance } from '../../../../test/quests/sequence-chance';
import {
    CombatConsumable,
    CombatContext,
    CombatEnemy,
    CombatEquipment,
    CombatParticipant,
    CombatSpell,
} from './combat-resolver';
import {
    PlaceholderCombatResolver,
    winChanceOf,
} from './placeholder-combat-resolver';

const hex = (suffix: string) => suffix.padStart(24, '0');

const weapon = (power: number): CombatEquipment => ({
    itemId: hex('e1'),
    slot: SlotType.rightHand,
    damages: { base: [{ type: 'cut', power }], energy: [] },
    equipType: EquipType.weapon,
    accessoryUseTypes: null,
});

const potion = (power = 200): CombatConsumable => ({
    itemId: hex('71'),
    quantity: 3,
    effect: EffectType.heal,
    power,
});

const spell = (suffix: string, usages: number): CombatSpell => ({
    spellId: hex(suffix),
    usages,
    damage: { type: 'fire', power: 10 },
});

const participant = (
    overrides: Partial<CombatParticipant> = {},
): CombatParticipant => ({
    characterId: hex('a1'),
    title: TitleType.rookie,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    injuries: [],
    equipment: [],
    activeSpells: [],
    consumables: [],
    companion: null,
    ...overrides,
});

const enemy = (
    lifePoints: number,
    damage: number,
    quantity = 1,
): CombatEnemy => ({
    id: hex('b1'),
    name: 'Wolf',
    lifePoints,
    xp: 100,
    damages: { base: [{ type: 'cut', power: damage }], energy: [] },
    weaknesses: { base: [], energy: [] },
    quantity,
});

const contextWith = (
    participants: CombatParticipant[],
    enemies: CombatEnemy[],
): CombatContext => ({
    quest: { id: hex('91'), type: QuestType.hunt, title: 'Wolves' },
    enemies,
    participants,
});

const contextOf = (
    participants: CombatParticipant[],
    enemyLifePoints = 1000,
    enemyDamage = 100,
): CombatContext =>
    contextWith(participants, [enemy(enemyLifePoints, enemyDamage)]);

// generatore con seme fissato: le 50 sequenze sono sempre le stesse
const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

describe('PlaceholderCombatResolver (PROVVISORIO)', () => {
    const resolver = new PlaceholderCombatResolver();
    const resolve = (context: CombatContext, values: number[]) =>
        resolver.resolve(context, new SequenceChance(values));

    it('loses with no gear: full enemy damage, no injury', () => {
        expect(resolve(contextOf([participant()]), [0.0, 0.9])).toEqual({
            verdict: 'failure',
            participants: [
                {
                    characterId: hex('a1'),
                    hpAfter: 900,
                    injuriesAdded: [],
                    consumablesUsed: [],
                    spellsUsed: [],
                },
            ],
        });
    });

    it('wins below the win chance and loses half the enemy damage', () => {
        const hero = participant({ equipment: [weapon(1000)] });

        const { verdict, participants } = resolve(
            contextOf([hero]),
            [0.4, 0.9],
        );
        const [result] = participants;

        expect(verdict).toBe('success');
        expect(result.hpAfter).toBe(950);
        expect(result.injuriesAdded).toEqual([]);
    });

    it('never drops below 1 HP and drinks a heal potion when low', () => {
        const hero = participant({
            currentLifePoints: 30,
            consumables: [potion(200)],
        });

        const { verdict, participants } = resolve(
            contextOf([hero]),
            [0.5, 0.9],
        );
        const [result] = participants;

        expect(verdict).toBe('failure');
        expect(result.hpAfter).toBe(201);
        expect(result.consumablesUsed).toEqual([
            { itemId: hex('71'), quantity: 1 },
        ]);
    });

    it('stays at 1 HP without a potion', () => {
        const hero = participant({ currentLifePoints: 30 });

        const [result] = resolve(contextOf([hero]), [0.5, 0.9]).participants;

        expect(result.hpAfter).toBe(1);
        expect(result.consumablesUsed).toEqual([]);
    });

    it('ignores consumables that do not heal', () => {
        const hero = participant({
            currentLifePoints: 30,
            consumables: [{ ...potion(), effect: EffectType.hunger }],
        });

        const [result] = resolve(contextOf([hero]), [0.5, 0.9]).participants;

        expect(result.hpAfter).toBe(1);
        expect(result.consumablesUsed).toEqual([]);
    });

    it('adds the first injury not already suffered', () => {
        const fresh = participant({ equipment: [weapon(1000)] });
        const concussed = participant({
            equipment: [weapon(1000)],
            injuries: [InjuryType.headConcussion],
        });

        expect(
            resolve(contextOf([fresh]), [0.4, 0.1, 0.0]).participants[0]
                .injuriesAdded,
        ).toEqual([InjuryType.headConcussion]);
        expect(
            resolve(contextOf([concussed]), [0.4, 0.1, 0.0]).participants[0]
                .injuriesAdded,
        ).toEqual([InjuryType.traumaticBrainInjury]);
    });

    it('shares one verdict with the whole party, effects ordered by character id (A3)', () => {
        const first = participant({
            characterId: hex('a1'),
            equipment: [weapon(500)],
        });
        const second = participant({
            characterId: hex('a2'),
            equipment: [weapon(500)],
        });

        const { verdict, participants } = resolve(
            contextOf([second, first]),
            [0.1, 0.9, 0.9],
        );

        expect(verdict).toBe('success');
        expect(participants.map((r) => r.characterId)).toEqual([
            hex('a1'),
            hex('a2'),
        ]);
        expect(participants.flatMap((r) => r.injuriesAdded)).toEqual([]);
    });

    it('lets one adventurer end at 1 HP while another is unharmed under the same verdict (A3)', () => {
        const wounded = participant({
            characterId: hex('a1'),
            currentLifePoints: 30,
        });
        const unharmed = participant({ characterId: hex('a2') });

        const { verdict, participants } = resolve(
            contextOf([wounded, unharmed]),
            [0.5, 0.9, 0.9],
        );

        expect(verdict).toBe('failure');
        expect(participants.map((r) => [r.characterId, r.hpAfter])).toEqual([
            [hex('a1'), 1],
            [hex('a2'), 950],
        ]);
    });

    it('aggregates the enemy life points by quantity in the win chance (D-02)', () => {
        const hero = participant({ equipment: [weapon(300)] });
        const pack = contextWith([hero], [enemy(100, 0, 3)]);
        const single = contextWith([hero], [enemy(300, 0)]);

        expect(winChanceOf(300, 300)).toBe(0.5);
        expect(resolve(pack, [0.49, 0.9]).verdict).toBe('success');
        expect(resolve(single, [0.49, 0.9]).verdict).toBe('success');
        expect(resolve(pack, [0.51, 0.9]).verdict).toBe('failure');
        expect(resolve(single, [0.51, 0.9]).verdict).toBe('failure');
    });

    it('aggregates the enemy damages by quantity (D-02)', () => {
        const hero = participant();
        const pair = contextWith([hero], [enemy(1000, 100, 2)]);
        const single = contextWith([hero], [enemy(1000, 200)]);

        const fromPair = resolve(pair, [0.9, 0.9]);

        expect(fromPair).toEqual(resolve(single, [0.9, 0.9]));
        expect(fromPair.participants[0].hpAfter).toBe(800);
    });

    it('uses one charge of each active spell that still has usages', () => {
        const hero = participant({
            activeSpells: [spell('51', 2), spell('52', 0)],
        });

        const [result] = resolve(contextOf([hero]), [0.9, 0.9]).participants;

        expect(result.spellsUsed).toEqual([{ spellId: hex('51'), usages: 1 }]);
    });

    it('is deterministic for the same chance sequence and does not mutate the context', () => {
        const context = contextOf([
            participant({
                characterId: hex('a2'),
                currentLifePoints: 40,
                consumables: [potion()],
                activeSpells: [spell('51', 1)],
            }),
            participant({ equipment: [weapon(300)] }),
        ]);
        const pristine = structuredClone(context);
        const values = [0.2, 0.1, 0.5, 0.7, 0.05, 0.3];

        const first = resolve(context, values);
        const second = resolve(context, values);

        expect(second).toEqual(first);
        expect(context).toEqual(pristine);
    });

    it('ignores the companion and draws the same sequence (D-20)', () => {
        const hero = participant({ equipment: [weapon(300)] });
        const companion = {
            petId: hex('61'),
            attack: { base: [{ type: 'cut', power: 900 }], energy: [] },
            defense: { base: [{ type: 'blunt', power: 50 }], energy: [] },
            currentLifePoints: 30,
            maxLifePoints: 50,
            xp: 40,
        };
        const values = [0.2, 0.1, 0.5, 0.7];
        const alone = new SequenceChance(values);
        const together = new SequenceChance(values);

        const withoutCompanion = resolver.resolve(contextOf([hero]), alone);
        const withCompanion = resolver.resolve(
            contextOf([{ ...hero, companion }]),
            together,
        );

        expect(withCompanion).toEqual(withoutCompanion);
        expect(together.drawn).toEqual(alone.drawn);
    });

    it('keeps hpAfter within [1, maxLifePoints] on 50 seeded sequences (D-07)', () => {
        const random = seeded(20261024);
        for (let run = 0; run < 50; run++) {
            const maxLifePoints = 1 + Math.floor(random() * 2000);
            const context = contextOf(
                [
                    participant({
                        characterId: hex('a1'),
                        maxLifePoints,
                        currentLifePoints:
                            1 + Math.floor(random() * maxLifePoints),
                        consumables: [potion(Math.floor(random() * 5000))],
                        injuries: [InjuryType.deepCut],
                    }),
                    participant({
                        characterId: hex('a2'),
                        maxLifePoints,
                        currentLifePoints: maxLifePoints,
                        equipment: [weapon(Math.floor(random() * 3000))],
                    }),
                ],
                Math.floor(random() * 3000),
                Math.floor(random() * 5000),
            );
            const values = Array.from({ length: 8 }, () => random());

            for (const result of resolve(context, values).participants) {
                expect(result.hpAfter).toBeGreaterThanOrEqual(1);
                expect(result.hpAfter).toBeLessThanOrEqual(maxLifePoints);
                expect(Number.isInteger(result.hpAfter)).toBe(true);
            }
        }
    });
});

describe('winChanceOf', () => {
    it('weighs the party power against the enemy life points', () => {
        expect(winChanceOf(300, 900)).toBe(0.25);
    });

    it('gives even odds when both sides are zero', () => {
        expect(winChanceOf(0, 0)).toBe(0.5);
    });
});
