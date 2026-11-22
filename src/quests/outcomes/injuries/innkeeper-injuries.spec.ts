import { InjuryType } from 'src/models/enums/injury-type.enum';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import {
    applyWoundCorrection,
    asInnkeeperHand,
    handInflictedOf,
    innkeeperInjuriesOf,
    netWoundCorrectionOf,
    removalsOf,
    withoutCarriedAgain,
    type CorrectedWounds,
    type WoundEffects,
    type WoundStatus,
} from 'src/quests/outcomes/injuries/innkeeper-injuries';
import { woundsAfter } from 'src/quests/outcomes/outcome-plan';

const { deepCut, infection, sprain, frostbite } = InjuryType;

describe('innkeeperInjuriesOf', () => {
    it.each<[string, WoundStatus]>([
        ['absent', { injuries: [deepCut] }],
        ['null', { injuries: [deepCut], innkeeperInjuries: null }],
        ['absent with no wounds at all', {}],
    ])(
        'reads no innkeeper wound when the field is missing: %s (D-16)',
        (_label, status) => {
            expect(innkeeperInjuriesOf(status)).toEqual([]);
        },
    );

    it('keeps only the wounds the character carries (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: [deepCut, infection],
                innkeeperInjuries: [infection, sprain],
            }),
        ).toEqual([infection]);
    });

    it('reads a duplicated innkeeper wound once (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: [deepCut],
                innkeeperInjuries: [deepCut, deepCut],
            }),
        ).toEqual([deepCut]);
    });

    it('drops an unknown wound type (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: ['oldWound', deepCut, 42, null],
                innkeeperInjuries: ['oldWound', 42, null, deepCut],
            }),
        ).toEqual([deepCut]);
    });

    it('keeps the order of the innkeeper list (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: [deepCut, infection, sprain, frostbite],
                innkeeperInjuries: [frostbite, deepCut, sprain],
            }),
        ).toEqual([frostbite, deepCut, sprain]);
    });

    it('does not mutate what it reads (D-16)', () => {
        const injuries = Object.freeze([deepCut, sprain]);
        const innkeeperInjuries = Object.freeze([sprain, sprain, infection]);
        const status = Object.freeze({ injuries, innkeeperInjuries });

        const result = innkeeperInjuriesOf(status);

        expect(result).toEqual([sprain]);
        expect(result).not.toBe(innkeeperInjuries);
        expect(injuries).toEqual([deepCut, sprain]);
        expect(innkeeperInjuries).toEqual([sprain, sprain, infection]);
    });
});

describe('applyWoundCorrection', () => {
    const effectsWith = (
        overrides: Partial<WoundEffects> = {},
    ): WoundEffects => ({
        injuriesAdded: [],
        ...overrides,
    });

    it.each<[string, WoundStatus, InjuryType[]]>([
        ['no wound at all', {}, [deepCut]],
        ['duplicated additions', { injuries: [sprain] }, [deepCut, deepCut]],
        [
            'an addition already carried',
            { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
            [deepCut, infection],
        ],
        [
            'a legacy string among the wounds',
            { injuries: ['oldWound', deepCut], innkeeperInjuries: [deepCut] },
            [frostbite],
        ],
    ])(
        'matches woundsAfter without removals nor hand-inflicted wounds: %s (D-16)',
        (_label, status, injuriesAdded) => {
            const expected = woundsAfter(
                (status.injuries ?? []) as InjuryType[],
                injuriesAdded,
            );

            expect(
                applyWoundCorrection(status, effectsWith({ injuriesAdded })),
            ).toEqual({
                injuries: expected.injuries,
                innkeeperInjuries: innkeeperInjuriesOf(status),
                added: expected.added,
                removed: [],
            });
        },
    );

    it('applies no change without a fight (D-13)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
                null,
            ),
        ).toEqual({
            injuries: [deepCut, sprain],
            innkeeperInjuries: [sprain],
            added: [],
            removed: [],
        });
    });

    it('removes an ordinary wound (D-13)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
                effectsWith({ injuriesRemoved: [deepCut] }),
            ),
        ).toEqual({
            injuries: [sprain],
            innkeeperInjuries: [sprain],
            added: [],
            removed: [deepCut],
        });
    });

    it('removes an innkeeper wound from both lists (D-13)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
                effectsWith({ injuriesRemoved: [sprain] }),
            ),
        ).toEqual({
            injuries: [deepCut],
            innkeeperInjuries: [],
            added: [],
            removed: [sprain],
        });
    });

    it('removes every copy of a duplicated wound (D-13)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut, sprain, deepCut] },
                effectsWith({ injuriesRemoved: [deepCut, deepCut] }),
            ),
        ).toEqual({
            injuries: [sprain],
            innkeeperInjuries: [],
            added: [],
            removed: [deepCut],
        });
    });

    it("marks a hand-inflicted wound as the innkeeper's (D-12)", () => {
        expect(
            applyWoundCorrection(
                { injuries: [sprain] },
                effectsWith({
                    injuriesAdded: [deepCut, infection],
                    innkeeperInjuries: [deepCut],
                }),
            ),
        ).toEqual({
            injuries: [sprain, deepCut, infection],
            innkeeperInjuries: [deepCut],
            added: [deepCut, infection],
            removed: [],
        });
    });

    it.each<[string, InjuryType[]]>([
        ['ordinary', []],
        ["the innkeeper's", [deepCut]],
    ])(
        'keeps the origin of a wound already carried and not removed: %s (D-16)',
        (_label, innkeeperInjuries) => {
            expect(
                applyWoundCorrection(
                    { injuries: [deepCut], innkeeperInjuries },
                    effectsWith({
                        injuriesAdded: [deepCut],
                        innkeeperInjuries: [deepCut],
                    }),
                ),
            ).toEqual({
                injuries: [deepCut],
                innkeeperInjuries,
                added: [],
                removed: [],
            });
        },
    );

    it('turns an ordinary wound into an innkeeper wound when removed and added again (D-16)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut, sprain] },
                effectsWith({
                    injuriesRemoved: [deepCut],
                    injuriesAdded: [deepCut],
                    innkeeperInjuries: [deepCut],
                }),
            ),
        ).toEqual({
            injuries: [sprain, deepCut],
            innkeeperInjuries: [deepCut],
            added: [],
            removed: [],
        });
    });

    it('turns an innkeeper wound into an ordinary one when removed and added again without the hand mark (D-13)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut], innkeeperInjuries: [deepCut] },
                effectsWith({
                    injuriesRemoved: [deepCut],
                    injuriesAdded: [deepCut],
                }),
            ),
        ).toEqual({
            injuries: [deepCut],
            innkeeperInjuries: [],
            added: [],
            removed: [],
        });
    });

    it('ignores a removal of a wound the character does not carry (D-13)', () => {
        expect(
            applyWoundCorrection(
                { injuries: [deepCut], innkeeperInjuries: [deepCut] },
                effectsWith({
                    injuriesRemoved: [
                        sprain,
                        'oldWound' as unknown as InjuryType,
                    ],
                }),
            ),
        ).toEqual({
            injuries: [deepCut],
            innkeeperInjuries: [deepCut],
            added: [],
            removed: [],
        });
    });

    it('ignores an unknown wound type among the additions (D-12)', () => {
        const unknownWound = 'oldWound' as unknown as InjuryType;

        expect(
            applyWoundCorrection(
                {},
                effectsWith({
                    injuriesAdded: [unknownWound, deepCut],
                    innkeeperInjuries: [unknownWound, deepCut],
                }),
            ),
        ).toEqual({
            injuries: [deepCut],
            innkeeperInjuries: [deepCut],
            added: [deepCut],
            removed: [],
        });
    });

    it.each<[string, WoundStatus, WoundEffects | null]>([
        [
            'no fight',
            { injuries: [deepCut], innkeeperInjuries: [deepCut] },
            null,
        ],
        [
            'an innkeeper wound removed',
            { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
            effectsWith({ injuriesRemoved: [sprain] }),
        ],
        [
            'a hand mark on a wound that was not added',
            { injuries: [sprain] },
            effectsWith({
                injuriesAdded: [deepCut],
                innkeeperInjuries: [infection, frostbite],
            }),
        ],
        [
            'a hand mark on a wound already carried',
            { injuries: [sprain] },
            effectsWith({
                injuriesAdded: [sprain, deepCut],
                innkeeperInjuries: [sprain, deepCut],
            }),
        ],
        [
            'a wound removed and added again',
            { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
            effectsWith({
                injuriesRemoved: [deepCut, sprain],
                injuriesAdded: [sprain, frostbite],
                innkeeperInjuries: [frostbite],
            }),
        ],
        [
            'an origin list wider than the wounds',
            { injuries: [deepCut], innkeeperInjuries: [deepCut, infection] },
            effectsWith({ injuriesAdded: [sprain] }),
        ],
    ])(
        'keeps the innkeeper list inside the carried wounds: %s (D-16)',
        (_label, status, effects) => {
            const corrected: CorrectedWounds = applyWoundCorrection(
                status,
                effects,
            );

            expect(corrected.innkeeperInjuries.length).toBe(
                new Set(corrected.innkeeperInjuries).size,
            );
            for (const injury of corrected.innkeeperInjuries) {
                expect(corrected.injuries).toContain(injury);
            }
        },
    );

    it('does not mutate what it reads', () => {
        const status = Object.freeze({
            injuries: Object.freeze([deepCut, sprain]),
            innkeeperInjuries: Object.freeze([sprain]),
        });
        const effects = Object.freeze({
            injuriesAdded: Object.freeze([infection]) as InjuryType[],
            injuriesRemoved: Object.freeze([deepCut]) as InjuryType[],
            innkeeperInjuries: Object.freeze([infection]) as InjuryType[],
        });

        const corrected = applyWoundCorrection(status, effects);

        expect(corrected).toEqual({
            injuries: [sprain, infection],
            innkeeperInjuries: [sprain, infection],
            added: [infection],
            removed: [deepCut],
        });
        expect(status.injuries).toEqual([deepCut, sprain]);
        expect(status.innkeeperInjuries).toEqual([sprain]);
        expect(effects.injuriesAdded).toEqual([infection]);
        expect(effects.injuriesRemoved).toEqual([deepCut]);
    });
});

describe('asInnkeeperHand', () => {
    const effectsOf = (
        fields: Partial<ParticipantEffects> = {},
    ): ParticipantEffects => ({
        characterId: '64b0000000000000000000a1',
        hpAfter: 300,
        injuriesAdded: [],
        consumablesUsed: [],
        spellsUsed: [],
        ...fields,
    });

    it("marks every added wound as the innkeeper's (D-12)", () => {
        const effects = effectsOf({
            injuriesAdded: [deepCut, sprain],
            injuriesRemoved: [infection],
        });

        expect(asInnkeeperHand(effects)).toEqual({
            ...effects,
            innkeeperInjuries: [deepCut, sprain],
        });
        expect(effects).not.toHaveProperty('innkeeperInjuries');
    });

    it('leaves effects without added wounds untouched (D-12)', () => {
        const effects = effectsOf({ injuriesRemoved: [infection] });

        const marked = asInnkeeperHand(effects);

        expect(marked).toBe(effects);
        expect(marked).not.toHaveProperty('innkeeperInjuries');
    });

    it('keeps a missing fight missing (D-12)', () => {
        expect(asInnkeeperHand(null)).toBeNull();
    });
});

describe('handInflictedOf', () => {
    it('takes the wounds the correction adds beyond the simulation (D-12)', () => {
        expect(
            handInflictedOf({ injuriesAdded: [sprain, deepCut] }, [sprain]),
        ).toEqual([deepCut]);
    });

    it('leaves a simulated wound kept by the correction ordinary (D-12)', () => {
        expect(handInflictedOf({ injuriesAdded: [sprain] }, [sprain])).toEqual(
            [],
        );
    });

    it('takes a wound removed and added again even when the simulation added it too (D-16)', () => {
        expect(
            handInflictedOf(
                {
                    injuriesAdded: [sprain, sprain, infection],
                    injuriesRemoved: [sprain],
                },
                [sprain, infection],
            ),
        ).toEqual([sprain]);
    });

    it('takes nothing from a correction that adds no wound (D-12)', () => {
        expect(
            handInflictedOf(
                { injuriesAdded: [], injuriesRemoved: [frostbite] },
                [sprain],
            ),
        ).toEqual([]);
    });
});

describe('netWoundCorrectionOf', () => {
    const sorted = (injuries: readonly unknown[]): string[] =>
        injuries.map(String).sort();

    const foldedStateOf = (
        status: WoundStatus,
        sequence: readonly WoundEffects[],
    ): WoundStatus =>
        sequence.reduce<WoundStatus>(
            (state, effects) => applyWoundCorrection(state, effects),
            status,
        );

    it.each<[string, WoundStatus, WoundEffects[]]>([
        [
            'no fight',
            { injuries: [deepCut, sprain], innkeeperInjuries: [sprain] },
            [],
        ],
        [
            'additions in two fights',
            { injuries: [sprain] },
            [
                { injuriesAdded: [deepCut] },
                { injuriesAdded: [deepCut, infection] },
            ],
        ],
        [
            'a wound added by the first fight and removed by the second',
            { injuries: [sprain] },
            [
                { injuriesAdded: [deepCut] },
                { injuriesAdded: [], injuriesRemoved: [deepCut] },
            ],
        ],
        [
            'a carried wound removed by the first fight and added back by hand in the second',
            { injuries: [deepCut, sprain] },
            [
                { injuriesAdded: [], injuriesRemoved: [deepCut] },
                { injuriesAdded: [deepCut], innkeeperInjuries: [deepCut] },
            ],
        ],
        [
            'an innkeeper wound removed by the first fight and simulated again in the second',
            { injuries: [deepCut, sprain], innkeeperInjuries: [deepCut] },
            [
                { injuriesAdded: [], injuriesRemoved: [deepCut] },
                { injuriesAdded: [deepCut] },
            ],
        ],
        [
            'a wound removed and added again in a single fight',
            { injuries: [deepCut] },
            [
                {
                    injuriesAdded: [deepCut],
                    injuriesRemoved: [deepCut],
                    innkeeperInjuries: [deepCut],
                },
            ],
        ],
        [
            'a hand-inflicted wound of the first fight left alone by the second',
            {},
            [
                { injuriesAdded: [frostbite], innkeeperInjuries: [frostbite] },
                { injuriesAdded: [frostbite, sprain] },
            ],
        ],
        [
            'duplicated wounds and a legacy string',
            {
                injuries: ['oldWound', deepCut, deepCut, sprain, sprain],
                innkeeperInjuries: [sprain, sprain],
            },
            [
                { injuriesAdded: [infection], injuriesRemoved: [sprain] },
                { injuriesAdded: [sprain], injuriesRemoved: [infection] },
            ],
        ],
        [
            'a duplicated wound removed and added again with the same origin',
            { injuries: [deepCut, deepCut, sprain] },
            [
                { injuriesAdded: [], injuriesRemoved: [deepCut] },
                { injuriesAdded: [deepCut] },
            ],
        ],
    ])(
        'gives back the folded state when applied to the starting state: %s (D-13)',
        (_label, status, sequence) => {
            const folded = foldedStateOf(status, sequence);

            const netted = applyWoundCorrection(
                status,
                netWoundCorrectionOf(status, sequence),
            );

            expect(sorted(netted.injuries)).toEqual(
                sorted(folded.injuries ?? []),
            );
            expect(sorted(netted.innkeeperInjuries)).toEqual(
                sorted(innkeeperInjuriesOf(folded)),
            );
        },
    );

    it('drops a wound added by a fight and removed by a later one (D-13)', () => {
        expect(
            netWoundCorrectionOf({ injuries: [sprain] }, [
                { injuriesAdded: [deepCut], innkeeperInjuries: [deepCut] },
                { injuriesAdded: [], injuriesRemoved: [deepCut] },
            ]),
        ).toEqual({ injuriesAdded: [] });
    });

    it('removes and adds again a wound whose origin changed (D-16)', () => {
        expect(
            netWoundCorrectionOf({ injuries: [deepCut, sprain] }, [
                { injuriesAdded: [], injuriesRemoved: [deepCut] },
                { injuriesAdded: [deepCut], innkeeperInjuries: [deepCut] },
            ]),
        ).toEqual({
            injuriesAdded: [deepCut],
            injuriesRemoved: [deepCut],
            innkeeperInjuries: [deepCut],
        });
        expect(
            netWoundCorrectionOf(
                { injuries: [deepCut], innkeeperInjuries: [deepCut] },
                [
                    { injuriesAdded: [], injuriesRemoved: [deepCut] },
                    { injuriesAdded: [deepCut] },
                ],
            ),
        ).toEqual({ injuriesAdded: [deepCut], injuriesRemoved: [deepCut] });
    });

    it('carries no removal nor origin key when nothing was removed or hand-inflicted (D-13)', () => {
        const net = netWoundCorrectionOf({ injuries: [sprain] }, [
            { injuriesAdded: [deepCut] },
            { injuriesAdded: [sprain, infection] },
        ]);

        expect(net).toEqual({ injuriesAdded: [deepCut, infection] });
        expect(net).not.toHaveProperty('injuriesRemoved');
        expect(net).not.toHaveProperty('innkeeperInjuries');
    });

    it('does not mutate what it reads (D-13)', () => {
        const status = { injuries: [deepCut], innkeeperInjuries: [deepCut] };
        const sequence = [
            { injuriesAdded: [sprain], injuriesRemoved: [deepCut] },
        ];

        netWoundCorrectionOf(status, sequence);

        expect(status).toEqual({
            injuries: [deepCut],
            innkeeperInjuries: [deepCut],
        });
        expect(sequence).toEqual([
            { injuriesAdded: [sprain], injuriesRemoved: [deepCut] },
        ]);
    });
});

describe('withoutCarriedAgain', () => {
    it('does not add a wound the character already carries (D-19)', () => {
        expect(
            withoutCarriedAgain([deepCut, sprain], {
                injuriesAdded: [deepCut, infection],
            }),
        ).toEqual({ injuriesAdded: [infection] });
    });

    it('keeps a carried wound removed and added again in the same correction (D-16, D-19)', () => {
        const effects: WoundEffects = {
            injuriesAdded: [deepCut, sprain],
            injuriesRemoved: [deepCut],
        };

        expect(withoutCarriedAgain([deepCut, sprain], effects)).toEqual({
            injuriesAdded: [deepCut],
            injuriesRemoved: [deepCut],
        });
    });

    it('leaves effects that propose no carried wound as they are (D-19)', () => {
        const effects: ParticipantEffects = {
            characterId: 'hero',
            hpAfter: 5,
            injuriesAdded: [infection],
            consumablesUsed: [],
            spellsUsed: [],
        };

        expect(withoutCarriedAgain([deepCut], effects)).toEqual(effects);
        expect(withoutCarriedAgain([], effects)).toEqual(effects);
    });

    it('does not mutate the effects it reads (D-19)', () => {
        const effects: WoundEffects = { injuriesAdded: [deepCut, infection] };

        withoutCarriedAgain([deepCut], effects);

        expect(effects).toEqual({ injuriesAdded: [deepCut, infection] });
    });
});

describe('removalsOf', () => {
    it.each<[string, InjuryType[] | null | undefined]>([
        ['an empty list', []],
        ['null', null],
        ['undefined', undefined],
    ])('carries no key for %s (D-13)', (_label, removed) => {
        expect(removalsOf(removed)).toEqual({});
        expect('injuriesRemoved' in removalsOf(removed)).toBe(false);
    });

    it('carries a copy of the removals when there are some (D-13)', () => {
        const removed = [deepCut, sprain];

        const { injuriesRemoved } = removalsOf(removed);

        expect(injuriesRemoved).toEqual([deepCut, sprain]);
        expect(injuriesRemoved).not.toBe(removed);
    });
});
