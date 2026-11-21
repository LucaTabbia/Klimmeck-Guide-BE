import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import {
    effectiveEffectsOf,
    effectiveParticipantEffectsOf,
    previousEffectsOf,
    reconcileFights,
    resetFrom,
} from 'src/quests/guided/draft-invalidation';
import {
    type MissionFightEffectsRecord,
    type MissionFightEnemyRecord,
    type MissionFightOutcomeRecord,
    type MissionFightRecord,
    MissionFightVerdict,
} from 'src/quests/guided/mission-draft.model';

const HERO_ID = new Types.ObjectId('64e0000000000000000000a1');
const MATE_ID = new Types.ObjectId('64e0000000000000000000a2');
const POTION_ID = new Types.ObjectId('64e0000000000000000000b1');
const WOLF_ID = new Types.ObjectId('64e0000000000000000000c1');
const BEAR_ID = new Types.ObjectId('64e0000000000000000000c2');
const TROLL_ID = new Types.ObjectId('64e0000000000000000000c3');

const effects = (hpAfter: number): MissionFightEffectsRecord => ({
    hpAfter,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
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

const simulatedFight = (
    enemies: MissionFightEnemyRecord[],
    outcomes: MissionFightOutcomeRecord[],
): MissionFightRecord => ({
    enemies,
    verdict: MissionFightVerdict.success,
    outcomes,
});

const unsimulated = (
    enemies: MissionFightEnemyRecord[],
): MissionFightRecord => ({ enemies, verdict: null, outcomes: [] });

const wolves = enemiesOf([WOLF_ID, 2]);
const bear = enemiesOf([BEAR_ID, 1]);
const troll = enemiesOf([TROLL_ID, 1]);

const threeFights = (): MissionFightRecord[] => [
    simulatedFight(wolves, [
        outcomeOf(HERO_ID, effects(900), {
            ...effects(800),
            injuriesAdded: [InjuryType.blackEye],
            consumablesUsed: [{ item: POTION_ID, quantity: 1 }],
        }),
        outcomeOf(MATE_ID, effects(950)),
    ]),
    simulatedFight(bear, [
        outcomeOf(HERO_ID, effects(700)),
        outcomeOf(MATE_ID, effects(900)),
    ]),
    simulatedFight(troll, [
        outcomeOf(HERO_ID, effects(500)),
        outcomeOf(MATE_ID, effects(850)),
    ]),
];

describe('effectiveEffectsOf', () => {
    it('prefers the correction to the simulation (D-24)', () => {
        expect(
            effectiveEffectsOf(outcomeOf(HERO_ID, effects(900), effects(1))),
        ).toEqual(effects(1));
        expect(effectiveEffectsOf(outcomeOf(HERO_ID, effects(900)))).toEqual(
            effects(900),
        );
        expect(effectiveEffectsOf(outcomeOf(HERO_ID, null))).toBeNull();
    });
});

describe('previousEffectsOf', () => {
    it('collects the effective effects of the fights before k for a character (D-02)', () => {
        const hero = HERO_ID.toHexString();

        expect(previousEffectsOf(threeFights(), 2, hero)).toEqual([
            {
                characterId: hero,
                hpAfter: 800,
                injuriesAdded: [InjuryType.blackEye],
                consumablesUsed: [
                    { itemId: POTION_ID.toHexString(), quantity: 1 },
                ],
                spellsUsed: [],
                innkeeperInjuries: [InjuryType.blackEye],
            },
            {
                characterId: hero,
                hpAfter: 700,
                injuriesAdded: [],
                consumablesUsed: [],
                spellsUsed: [],
            },
        ]);
    });
});

describe('effectiveParticipantEffectsOf', () => {
    const { blackEye, deepCut, sprain } = InjuryType;
    const hero = HERO_ID.toHexString();
    const woundsOf = (
        hpAfter: number,
        wounds: Partial<MissionFightEffectsRecord>,
    ): MissionFightEffectsRecord => ({ ...effects(hpAfter), ...wounds });

    it('marks the hand-inflicted wounds of a corrected fight (D-12)', () => {
        const corrected = outcomeOf(
            HERO_ID,
            woundsOf(900, { injuriesAdded: [sprain, deepCut] }),
            woundsOf(800, {
                injuriesAdded: [sprain, blackEye, deepCut],
                injuriesRemoved: [deepCut],
            }),
        );

        expect(effectiveParticipantEffectsOf(hero, corrected)).toEqual({
            characterId: hero,
            hpAfter: 800,
            injuriesAdded: [sprain, blackEye, deepCut],
            injuriesRemoved: [deepCut],
            consumablesUsed: [],
            spellsUsed: [],
            innkeeperInjuries: [blackEye, deepCut],
        });
    });

    it('marks nothing on a fight left as simulated (D-12)', () => {
        const simulated = effectiveParticipantEffectsOf(
            hero,
            outcomeOf(HERO_ID, woundsOf(900, { injuriesAdded: [sprain] })),
        );
        const keptAsSimulated = effectiveParticipantEffectsOf(
            hero,
            outcomeOf(
                HERO_ID,
                woundsOf(900, { injuriesAdded: [sprain] }),
                woundsOf(700, { injuriesAdded: [sprain] }),
            ),
        );

        expect(simulated).toEqual({
            characterId: hero,
            hpAfter: 900,
            injuriesAdded: [sprain],
            consumablesUsed: [],
            spellsUsed: [],
        });
        expect(simulated).not.toHaveProperty('innkeeperInjuries');
        expect(keptAsSimulated).not.toHaveProperty('innkeeperInjuries');
    });

    it('carries the marks into the effects of the previous fights (D-12)', () => {
        expect(
            previousEffectsOf(threeFights(), 2, hero).map(
                ({ innkeeperInjuries }) => innkeeperInjuries,
            ),
        ).toEqual([[blackEye], undefined]);
        expect(
            previousEffectsOf(threeFights(), 2, MATE_ID.toHexString()).some(
                (fight) => 'innkeeperInjuries' in fight,
            ),
        ).toBe(false);
    });

    it('answers no effect for an unsimulated fight', () => {
        expect(
            effectiveParticipantEffectsOf(hero, outcomeOf(HERO_ID, null)),
        ).toBeNull();
    });
});

describe('reconcileFights', () => {
    it('compares the enemies of a fight by order, id and quantity (D-24)', () => {
        const existing = [
            simulatedFight(enemiesOf([WOLF_ID, 2], [BEAR_ID, 1]), [
                outcomeOf(HERO_ID, effects(900)),
            ]),
        ];

        expect(
            reconcileFights(existing, [enemiesOf([WOLF_ID, 2], [BEAR_ID, 1])]),
        ).toEqual(existing);
        for (const changed of [
            enemiesOf([WOLF_ID, 3], [BEAR_ID, 1]),
            enemiesOf([TROLL_ID, 2], [BEAR_ID, 1]),
            enemiesOf([BEAR_ID, 1], [WOLF_ID, 2]),
            enemiesOf([WOLF_ID, 2], [BEAR_ID, 1], [TROLL_ID, 1]),
            enemiesOf([WOLF_ID, 2]),
        ]) {
            expect(reconcileFights(existing, [changed])).toEqual([
                unsimulated(changed),
            ]);
        }
    });

    it('keeps the identical prefix of the fights (D-24)', () => {
        const existing = threeFights();

        const fights = reconcileFights(existing, [
            enemiesOf([WOLF_ID, 2]),
            enemiesOf([BEAR_ID, 1]),
            troll,
        ]);

        expect(fights).toEqual(existing);
        expect(fights[0]).toBe(existing[0]);
        expect(fights[1]).toBe(existing[1]);
    });

    it.each([
        ['quantity', enemiesOf([BEAR_ID, 2])],
        ['enemy', enemiesOf([WOLF_ID, 1])],
    ])(
        'voids the fight whose enemies changed and every following one (D-24): %s',
        (_change, changed) => {
            const existing = threeFights();

            const fights = reconcileFights(existing, [wolves, changed, troll]);

            expect(fights).toEqual([
                existing[0],
                { enemies: changed, verdict: null, outcomes: [] },
                { enemies: troll, verdict: null, outcomes: [] },
            ]);
        },
    );

    it('appends unsimulated fights and drops removed ones (D-24)', () => {
        const existing = threeFights();
        const extra = enemiesOf([WOLF_ID, 5]);

        expect(reconcileFights(existing, [wolves, bear, troll, extra])).toEqual(
            [...existing, unsimulated(extra)],
        );
        expect(reconcileFights(existing, [wolves])).toEqual([existing[0]]);
    });

    it('allows no fights at all (D-24)', () => {
        expect(reconcileFights(threeFights(), [])).toEqual([]);
    });

    it('keeps one verdict per fight (D-21)', () => {
        const fights = reconcileFights(threeFights(), [
            wolves,
            enemiesOf([BEAR_ID, 4]),
        ]);

        expect(fights.map((fight) => fight.verdict)).toEqual([
            MissionFightVerdict.success,
            null,
        ]);
        for (const outcome of fights.flatMap((fight) => fight.outcomes))
            expect(Object.keys(outcome).sort()).toEqual([
                'character',
                'consumablesAvailable',
                'corrected',
                'hpBefore',
                'injuriesBefore',
                'simulated',
                'spellsAvailable',
            ]);
    });
});

describe('resetFrom', () => {
    it('resets from an index keeping the enemies (D-24)', () => {
        const existing = threeFights();

        expect(resetFrom(existing, 1)).toEqual([
            existing[0],
            unsimulated(bear),
            unsimulated(troll),
        ]);
    });
});
