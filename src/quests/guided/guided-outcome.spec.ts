import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import {
    aggregateEffectsOf,
    assertFightsComplete,
    correctionOverSimulated,
    effectiveSequenceOf,
    mergedEnemiesOf,
    overrideInputOf,
} from 'src/quests/guided/guided-outcome';
import {
    type MissionFightEffectsRecord,
    type MissionFightEnemyRecord,
    type MissionFightOutcomeRecord,
    type MissionFightRecord,
    MissionFightVerdict,
} from 'src/quests/guided/mission-draft.model';

const HERO_ID = new Types.ObjectId('64f3000000000000000000a1');
const MATE_ID = new Types.ObjectId('64f3000000000000000000a2');
const POTION_ID = new Types.ObjectId('64f3000000000000000000b1');
const HERB_ID = new Types.ObjectId('64f3000000000000000000b2');
const SPARK_ID = new Types.ObjectId('64f3000000000000000000d1');
const WOLF_ID = new Types.ObjectId('64f3000000000000000000c1');
const ORC_ID = new Types.ObjectId('64f3000000000000000000c2');
const HERO = HERO_ID.toHexString();
const MATE = MATE_ID.toHexString();

const effects = (
    hpAfter: number,
    overrides: Partial<MissionFightEffectsRecord> = {},
): MissionFightEffectsRecord => ({
    hpAfter,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
    ...overrides,
});

const outcomeOf = (
    character: Types.ObjectId,
    simulated: MissionFightEffectsRecord | null,
    corrected: MissionFightEffectsRecord | null = null,
): MissionFightOutcomeRecord => ({
    character,
    hpBefore: 1000,
    injuriesBefore: [],
    consumablesAvailable: [],
    spellsAvailable: [],
    simulated,
    corrected,
});

const enemiesOf = (
    ...entries: [Types.ObjectId, number][]
): MissionFightEnemyRecord[] =>
    entries.map(([enemy, quantity]) => ({ enemy, quantity }));

const fightOf = (
    enemies: MissionFightEnemyRecord[],
    outcomes: MissionFightOutcomeRecord[],
    verdict: MissionFightVerdict | null = MissionFightVerdict.success,
): MissionFightRecord => ({ enemies, verdict, outcomes });

// il primo scontro corretto dall'oste, il secondo solo simulato
const twoFights = (): MissionFightRecord[] => [
    fightOf(enemiesOf([WOLF_ID, 2]), [
        outcomeOf(
            HERO_ID,
            effects(900),
            effects(800, {
                injuriesAdded: [InjuryType.blackEye],
                consumablesUsed: [{ item: POTION_ID, quantity: 1 }],
                spellsUsed: [{ spell: SPARK_ID, usages: 1 }],
            }),
        ),
        outcomeOf(MATE_ID, effects(950)),
    ]),
    fightOf(enemiesOf([ORC_ID, 1], [WOLF_ID, 1]), [
        outcomeOf(
            HERO_ID,
            effects(600, {
                injuriesAdded: [InjuryType.blackEye, InjuryType.deepCut],
                consumablesUsed: [
                    { item: HERB_ID, quantity: 2 },
                    { item: POTION_ID, quantity: 1 },
                ],
                spellsUsed: [{ spell: SPARK_ID, usages: 2 }],
            }),
        ),
        outcomeOf(MATE_ID, effects(900)),
    ]),
];

const codeOf = (run: () => unknown): unknown => {
    try {
        run();
    } catch (error) {
        return (error as { code?: unknown }).code;
    }
    return null;
};

describe('guided outcome', () => {
    it('aggregates the corrected effects of every fight (D-08)', () => {
        expect(aggregateEffectsOf(twoFights(), HERO)).toEqual({
            characterId: HERO,
            hpAfter: 600,
            injuriesAdded: [InjuryType.blackEye, InjuryType.deepCut],
            consumablesUsed: [
                { itemId: POTION_ID.toHexString(), quantity: 2 },
                { itemId: HERB_ID.toHexString(), quantity: 2 },
            ],
            spellsUsed: [{ spellId: SPARK_ID.toHexString(), usages: 3 }],
        });
        expect(aggregateEffectsOf(twoFights(), MATE)).toEqual({
            characterId: MATE,
            hpAfter: 900,
            injuriesAdded: [],
            consumablesUsed: [],
            spellsUsed: [],
        });
    });

    it('aggregates the companion life of the last fight that had it (D-17, D-26)', () => {
        const fightsWith = (...lives: (number | null)[]) =>
            lives.map((companionLifeAfter, index) =>
                fightOf(enemiesOf([WOLF_ID, 1]), [
                    outcomeOf(
                        HERO_ID,
                        effects(900 - index * 100, { companionLifeAfter }),
                    ),
                ]),
            );

        expect(
            aggregateEffectsOf(fightsWith(40, null), HERO)?.companionLifeAfter,
        ).toBe(40);
        expect(
            aggregateEffectsOf(fightsWith(40, 1), HERO)?.companionLifeAfter,
        ).toBe(1);
        expect(
            aggregateEffectsOf(
                [
                    fightOf(enemiesOf([WOLF_ID, 1]), [
                        outcomeOf(
                            HERO_ID,
                            effects(900),
                            effects(800, { companionLifeAfter: 30 }),
                        ),
                    ]),
                ],
                HERO,
            )?.companionLifeAfter,
        ).toBe(30);
        expect(
            aggregateEffectsOf(fightsWith(null, null), HERO),
        ).not.toHaveProperty('companionLifeAfter');
        expect(aggregateEffectsOf(twoFights(), HERO)).not.toHaveProperty(
            'companionLifeAfter',
        );
    });

    it('has no battle without fights (D-24)', () => {
        expect(aggregateEffectsOf([], HERO)).toBeNull();
        expect(mergedEnemiesOf([])).toEqual([]);
        expect(effectiveSequenceOf([], HERO)).toEqual([]);
    });

    it('merges the enemies of every fight in first appearance order (D-08)', () => {
        expect(mergedEnemiesOf(twoFights())).toEqual([
            { enemy: WOLF_ID, quantity: 3 },
            { enemy: ORC_ID, quantity: 1 },
        ]);
    });

    it('refuses an unsimulated fight or a missing participant (D-24)', () => {
        const [first, second] = twoFights();
        const unsimulated = fightOf(second.enemies, [], null);
        const withoutMate = fightOf(second.enemies, [second.outcomes[0]]);
        const withoutEffects = fightOf(second.enemies, [
            second.outcomes[0],
            outcomeOf(MATE_ID, null),
        ]);

        expect(codeOf(() => assertFightsComplete([first], [HERO, MATE]))).toBe(
            null,
        );
        expect(codeOf(() => assertFightsComplete([], [HERO, MATE]))).toBe(null);
        for (const fights of [
            [first, unsimulated],
            [first, withoutMate],
            [first, withoutEffects],
        ]) {
            expect(
                codeOf(() => assertFightsComplete(fights, [HERO, MATE])),
            ).toBe('OUTCOME_OVERRIDE_INVALID');
        }
    });

    it('marks which effects come from a correction (D-14)', () => {
        const sequence = effectiveSequenceOf(twoFights(), HERO);

        expect(sequence.map(({ corrected }) => corrected)).toEqual([
            true,
            false,
        ]);
        expect(sequence.map(({ effects }) => effects.hpAfter)).toEqual([
            800, 600,
        ]);
        expect(
            effectiveSequenceOf(twoFights(), MATE).map(
                ({ corrected }) => corrected,
            ),
        ).toEqual([false, false]);
    });

    it('carries the origin of the wounds along the effective sequence (D-12)', () => {
        const sequence = effectiveSequenceOf(twoFights(), HERO);

        expect(sequence[0].effects.innkeeperInjuries).toEqual([
            InjuryType.blackEye,
        ]);
        expect(sequence[1].effects).not.toHaveProperty('innkeeperInjuries');
        expect(
            effectiveSequenceOf(twoFights(), MATE).some(
                ({ effects }) => 'innkeeperInjuries' in effects,
            ),
        ).toBe(false);
    });

    it('turns effects back into an override input (D-06)', () => {
        const [first] = effectiveSequenceOf(twoFights(), HERO);

        expect(overrideInputOf(HERO, first.effects)).toEqual({
            characterId: HERO,
            hpAfter: 800,
            injuries: [InjuryType.blackEye],
            consumablesUsed: [{ item: POTION_ID.toHexString(), quantity: 1 }],
            spellsUsed: [{ spell: SPARK_ID.toHexString(), usages: 1 }],
        });
    });
});

// A-08: nel flusso guidato ciò che l'oste non tocca vale il simulato dello scontro
describe('correctionOverSimulated', () => {
    const simulated = {
        characterId: HERO,
        hpAfter: 640,
        injuriesAdded: [InjuryType.blackEye],
        consumablesUsed: [{ itemId: POTION_ID.toHexString(), quantity: 1 }],
        spellsUsed: [{ spellId: SPARK_ID.toHexString(), usages: 2 }],
        companionLifeAfter: 35,
    };
    const simulatedInput = {
        characterId: HERO,
        hpAfter: 640,
        injuries: [InjuryType.blackEye],
        consumablesUsed: [{ item: POTION_ID.toHexString(), quantity: 1 }],
        spellsUsed: [{ spell: SPARK_ID.toHexString(), usages: 2 }],
        companionLifeAfter: 35,
    };

    it('fills every omitted field with the simulated value', () => {
        expect(
            correctionOverSimulated({ characterId: HERO }, simulated),
        ).toEqual(simulatedInput);
    });

    it('fills every null field with the simulated value', () => {
        expect(
            correctionOverSimulated(
                {
                    characterId: HERO,
                    hpAfter: null,
                    injuries: null,
                    consumablesUsed: null,
                    spellsUsed: null,
                    companionLifeAfter: null,
                },
                simulated,
            ),
        ).toEqual(simulatedInput);
    });

    it('keeps every explicit value, empty lists and zeros included', () => {
        expect(
            correctionOverSimulated(
                {
                    characterId: HERO,
                    hpAfter: 0,
                    injuries: [],
                    consumablesUsed: [],
                    spellsUsed: [],
                    companionLifeAfter: 0,
                },
                simulated,
            ),
        ).toEqual({
            characterId: HERO,
            hpAfter: 0,
            injuries: [],
            consumablesUsed: [],
            spellsUsed: [],
            companionLifeAfter: 0,
        });
    });

    it('omits the companion life when the simulated fight had no companion', () => {
        const { companionLifeAfter, ...withoutCompanion } = simulated;

        expect(companionLifeAfter).toBe(35);
        expect(
            correctionOverSimulated(
                { characterId: HERO, hpAfter: 500 },
                withoutCompanion,
            ),
        ).not.toHaveProperty('companionLifeAfter');
    });

    it('takes the removals from the correction over the simulated effects (D-13)', () => {
        expect(
            correctionOverSimulated(
                { characterId: HERO, injuriesRemoved: [InjuryType.deepCut] },
                simulated,
            ),
        ).toEqual({
            ...simulatedInput,
            injuriesRemoved: [InjuryType.deepCut],
        });
    });

    it.each<[string, { injuriesRemoved?: InjuryType[] | null }]>([
        ['omitted', {}],
        ['null', { injuriesRemoved: null }],
        ['an empty list', { injuriesRemoved: [] }],
    ])(
        'carries no removal when the correction omits them or sends an empty list: %s (D-13)',
        (_label, removals) => {
            const merged = correctionOverSimulated(
                { characterId: HERO, ...removals },
                { ...simulated, injuriesRemoved: [InjuryType.deepCut] },
            );

            expect(merged).toEqual(simulatedInput);
            expect(merged).not.toHaveProperty('injuriesRemoved');
        },
    );
});
