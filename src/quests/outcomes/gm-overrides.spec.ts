import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { OwnedPetEntry } from 'src/characters/pets/owned-pet-entry';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import {
    MAX_OVERRIDE_ENTRIES,
    type OverrideParticipant,
    overrideParticipantOf,
    validateOverrides,
} from 'src/quests/outcomes/gm-overrides';

const A_ID = new Types.ObjectId('64b0000000000000000000a1');
const B_ID = new Types.ObjectId('64b0000000000000000000b1');
const STRANGER_ID = new Types.ObjectId('64b0000000000000000000c1');
const POTION_ID = new Types.ObjectId('64b0000000000000000000d1');
const OTHER_ITEM_ID = new Types.ObjectId('64b0000000000000000000d2');
const S1_ID = new Types.ObjectId('64b0000000000000000000e1');
const INACTIVE_SPELL_ID = new Types.ObjectId('64b0000000000000000000e2');
const WOLF_ID = new Types.ObjectId('64b0000000000000000000f1');

const A = A_ID.toHexString();
const B = B_ID.toHexString();
const POTION = POTION_ID.toHexString();
const S1 = S1_ID.toHexString();
const INACTIVE_SPELL = INACTIVE_SPELL_ID.toHexString();

const NO_PETS = new Map<string, { maxLifePoints?: unknown; maxXp?: unknown }>();
const PET_CATALOG = new Map([
    [WOLF_ID.toHexString(), { name: 'Lupo', maxLifePoints: 100, maxXp: 100 }],
]);

const participants: OverrideParticipant[] = [
    {
        characterId: A_ID,
        currentLifePoints: 600,
        maxLifePoints: 1000,
        ownedLoot: new Map([[POTION, 2]]),
        activeSpells: new Map([[S1, 2]]),
        companion: { lifeBefore: 60, maxLifePoints: 100 },
    },
    {
        characterId: B_ID,
        currentLifePoints: 1000,
        maxLifePoints: 1200,
        ownedLoot: new Map(),
        activeSpells: new Map(),
        companion: null,
    },
];

const overrideOf = (
    fields: Partial<ParticipantOverrideInput> = {},
): ParticipantOverrideInput => ({ characterId: A, ...fields });

function codeOf(run: () => unknown): GameRuleErrorCode | undefined {
    try {
        run();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

const expectInvalid = (overrides: ParticipantOverrideInput[]) =>
    expect(codeOf(() => validateOverrides(overrides, participants))).toBe(
        GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
    );

describe('validateOverrides', () => {
    it.each([undefined, null, []])(
        'leaves every participant without a fight when overrides are %p',
        (overrides) => {
            const effects = validateOverrides(overrides, participants);

            expect([...effects.entries()]).toEqual([
                [A, null],
                [B, null],
            ]);
        },
    );

    it('turns a full override into the participant effects', () => {
        const effects = validateOverrides(
            [
                overrideOf({
                    hpAfter: 300,
                    injuries: [InjuryType.deepCut, InjuryType.deepCut],
                    consumablesUsed: [{ item: POTION, quantity: 1 }],
                    spellsUsed: [{ spell: S1, usages: 2 }],
                }),
            ],
            participants,
        );

        expect(effects.get(A)).toEqual({
            characterId: A,
            hpAfter: 300,
            injuriesAdded: [InjuryType.deepCut],
            consumablesUsed: [{ itemId: POTION, quantity: 1 }],
            spellsUsed: [{ spellId: S1, usages: 2 }],
        });
        expect(effects.get(B)).toBeNull();
    });

    it('keeps the current life points when the override has only injuries', () => {
        const effects = validateOverrides(
            [overrideOf({ injuries: [InjuryType.fracturedRib] })],
            participants,
        );

        expect(effects.get(A)).toEqual({
            characterId: A,
            hpAfter: 600,
            injuriesAdded: [InjuryType.fracturedRib],
            consumablesUsed: [],
            spellsUsed: [],
        });
    });

    it.each([
        ['a stranger', STRANGER_ID.toHexString()],
        ['a malformed id', 'abc'],
    ])('rejects an override on %s', (_label, characterId) => {
        expect(
            codeOf(() =>
                validateOverrides([overrideOf({ characterId })], participants),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_NOT_PARTICIPANT);
    });

    it('rejects two overrides for the same participant', () => {
        expectInvalid([overrideOf(), overrideOf({ hpAfter: 10 })]);
    });

    it.each([0, 1001, 1.5, -5])('rejects hpAfter %p', (hpAfter) => {
        expectInvalid([overrideOf({ hpAfter })]);
    });

    it.each([1, 1000])('accepts hpAfter %p', (hpAfter) => {
        expect(
            validateOverrides([overrideOf({ hpAfter })], participants).get(A)
                ?.hpAfter,
        ).toBe(hpAfter);
    });

    it.each([
        ['an item not owned', OTHER_ITEM_ID.toHexString(), 1],
        ['more than owned', POTION, 3],
        ['a zero quantity', POTION, 0],
        ['a fractional quantity', POTION, 1.5],
        ['a malformed id', 'abc', 1],
    ])('rejects a consumable with %s', (_label, item, quantity) => {
        expectInvalid([overrideOf({ consumablesUsed: [{ item, quantity }] })]);
    });

    it('rejects two entries of the same potion beyond the owned quantity', () => {
        expectInvalid([
            overrideOf({
                consumablesUsed: [
                    { item: POTION, quantity: 2 },
                    { item: POTION, quantity: 1 },
                ],
            }),
        ]);
    });

    it('merges two entries of the same potion within the owned quantity', () => {
        const effects = validateOverrides(
            [
                overrideOf({
                    consumablesUsed: [
                        { item: POTION, quantity: 1 },
                        { item: POTION, quantity: 1 },
                    ],
                }),
            ],
            participants,
        );

        expect(effects.get(A)?.consumablesUsed).toEqual([
            { itemId: POTION, quantity: 2 },
        ]);
    });

    it.each([
        ['an inactive spell', INACTIVE_SPELL_ID.toHexString(), 1],
        ['more usages than left', S1, 3],
        ['zero usages', S1, 0],
        ['a malformed id', 'abc', 1],
    ])('rejects %s', (_label, spell, usages) => {
        expectInvalid([overrideOf({ spellsUsed: [{ spell, usages }] })]);
    });

    describe('caps every override list', () => {
        const LIMIT = MAX_OVERRIDE_ENTRIES;
        const generous: OverrideParticipant[] = [
            {
                ...participants[0],
                ownedLoot: new Map([[POTION, 1_000]]),
                activeSpells: new Map([[S1, 1_000]]),
            },
        ];
        const times = <T>(count: number, entry: T): T[] =>
            Array.from({ length: count }, () => entry);
        const codeWith = (overrides: ParticipantOverrideInput[]) =>
            codeOf(() => validateOverrides(overrides, generous));

        it('accepts lists at the limit', () => {
            expect(
                codeWith([
                    overrideOf({
                        injuries: times(LIMIT, InjuryType.deepCut),
                        consumablesUsed: times(LIMIT, {
                            item: POTION,
                            quantity: 1,
                        }),
                        spellsUsed: times(LIMIT, { spell: S1, usages: 1 }),
                    }),
                ]),
            ).toBeUndefined();
        });

        it.each([
            [
                'injuries',
                overrideOf({ injuries: times(LIMIT + 1, InjuryType.deepCut) }),
            ],
            [
                'consumables',
                overrideOf({
                    consumablesUsed: times(LIMIT + 1, {
                        item: POTION,
                        quantity: 1,
                    }),
                }),
            ],
            [
                'spells',
                overrideOf({
                    spellsUsed: times(LIMIT + 1, { spell: S1, usages: 1 }),
                }),
            ],
        ])('rejects too many %s', (_label, override) => {
            expect(codeWith([override])).toBe(
                GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
            );
        });

        it('rejects too many participant overrides before looking them up', () => {
            expect(
                codeWith(
                    times(
                        LIMIT + 1,
                        overrideOf({ characterId: STRANGER_ID.toHexString() }),
                    ),
                ),
            ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        });
    });

    it('rejects an injury outside the catalog', () => {
        expectInvalid([
            overrideOf({ injuries: ['scratch' as unknown as InjuryType] }),
        ]);
    });
});

describe('overrideParticipantOf', () => {
    it('reads the limits from the outcome snapshot', () => {
        const participant = overrideParticipantOf(
            {
                _id: A_ID,
                status: {
                    xp: 0,
                    title: TitleType.rookie,
                    currentLifePoints: 600,
                    maxLifePoints: 1000,
                    spellStates: [
                        {
                            spell: S1_ID,
                            usages: 2,
                            recoveries: [],
                            active: true,
                        },
                        {
                            spell: 'not-an-id',
                            usages: 4,
                            recoveries: [],
                            active: true,
                        },
                    ],
                },
                assets: {
                    ownedItems: [
                        { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
                        { itemType: 'LootItem', item: POTION, quantity: 1 },
                    ],
                    ownedEquipments: [
                        {
                            itemType: 'EquipmentItem',
                            item: OTHER_ITEM_ID,
                            quantity: 1,
                        },
                    ],
                },
            },
            NO_PETS,
        );

        expect(participant.characterId).toBe(A_ID);
        expect(participant.currentLifePoints).toBe(600);
        expect(participant.maxLifePoints).toBe(1000);
        expect([...participant.ownedLoot.entries()]).toEqual([[POTION, 2]]);
        expect([...participant.activeSpells.entries()]).toEqual([[S1, 2]]);
    });

    const knowingSnapshot = () => ({
        _id: A_ID,
        status: {
            xp: 0,
            title: TitleType.rookie,
            spellStates: [
                {
                    spell: INACTIVE_SPELL_ID,
                    usages: 5,
                    recoveries: [],
                    active: false,
                },
                { spell: S1_ID, usages: 1, recoveries: [], active: true },
            ],
        },
    });
    const spending =
        (spell: string, usages: number) =>
        (): ReturnType<typeof validateOverrides> =>
            validateOverrides(
                [overrideOf({ spellsUsed: [{ spell, usages }] })],
                [overrideParticipantOf(knowingSnapshot(), NO_PETS)],
            );
    const invalidOverride = expect.objectContaining({
        code: GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
        message: 'Esito non valido per questo personaggio',
    });

    it('reads the override limits of the spells from the active spell states (D-07)', () => {
        const participant = overrideParticipantOf(knowingSnapshot(), NO_PETS);

        expect([...participant.activeSpells.entries()]).toEqual([[S1, 1]]);
    });

    it('reads a spell state stored without the flag as not active (D-07)', () => {
        const participant = overrideParticipantOf(
            {
                _id: A_ID,
                status: {
                    xp: 0,
                    title: TitleType.rookie,
                    spellStates: [{ spell: S1_ID, usages: 2, recoveries: [] }],
                },
            },
            NO_PETS,
        );

        expect(participant.activeSpells.size).toBe(0);
    });

    it('skips an empty entry next to one without the flag and keeps the active one (D-07)', () => {
        const participant = overrideParticipantOf(
            {
                _id: A_ID,
                status: {
                    xp: 0,
                    title: TitleType.rookie,
                    spellStates: [
                        null,
                        { spell: INACTIVE_SPELL_ID, usages: 2, recoveries: [] },
                        {
                            spell: S1_ID,
                            usages: 1,
                            recoveries: [],
                            active: true,
                        },
                    ] as never,
                },
            },
            NO_PETS,
        );

        expect([...participant.activeSpells.entries()]).toEqual([[S1, 1]]);
    });

    it('never reads a negative limit from an active spell state (D-07)', () => {
        const participant = overrideParticipantOf(
            {
                _id: A_ID,
                status: {
                    xp: 0,
                    title: TitleType.rookie,
                    spellStates: [
                        {
                            spell: S1_ID,
                            usages: -3,
                            recoveries: [],
                            active: true,
                        },
                    ],
                },
            },
            NO_PETS,
        );

        expect([...participant.activeSpells.entries()]).toEqual([[S1, 0]]);
    });

    it('rejects an override that spends more usages than the active spell state holds (D-07)', () => {
        expect(spending(S1, 2)).toThrow(invalidOverride);
        expect(codeOf(spending(S1, 1))).toBeUndefined();
        expect(spending(S1, 1)().get(A)?.spellsUsed).toEqual([
            { spellId: S1, usages: 1 },
        ]);
    });

    it('rejects an override that spends a spell whose state is not active (D-07)', () => {
        expect(spending(INACTIVE_SPELL, 1)).toThrow(invalidOverride);
    });

    it('falls back to the level table for a legacy snapshot', () => {
        const participant = overrideParticipantOf(
            {
                _id: B_ID,
                status: { title: TitleType.rookie },
            },
            NO_PETS,
        );

        expect(participant.maxLifePoints).toBeGreaterThan(0);
        expect(participant.currentLifePoints).toBe(participant.maxLifePoints);
        expect(participant.ownedLoot.size).toBe(0);
        expect(participant.activeSpells.size).toBe(0);
    });

    describe('the companion life correction', () => {
        const snapshotWith = (entry: OwnedPetEntry | null) => ({
            _id: A_ID,
            status: {
                xp: 0,
                title: TitleType.rookie,
                currentLifePoints: 600,
                maxLifePoints: 1000,
            },
            assets: entry ? { pet: WOLF_ID, ownedPets: [entry] } : {},
        });
        const fenrirAt = (life: number): OwnedPetEntry => ({
            pet: WOLF_ID,
            xp: 0,
            currentLifePoints: life,
            level: 1,
        });
        const correcting = (
            entry: OwnedPetEntry | null,
            companionLifeAfter: number,
        ) =>
            validateOverrides(
                [overrideOf({ companionLifeAfter })],
                [overrideParticipantOf(snapshotWith(entry), PET_CATALOG)],
            );

        it('serves the companion bounds of a participant (D-17)', () => {
            expect(
                overrideParticipantOf(snapshotWith(fenrirAt(60)), PET_CATALOG)
                    .companion,
            ).toEqual({ lifeBefore: 60, maxLifePoints: 100 });
            expect(
                overrideParticipantOf(snapshotWith(null), PET_CATALOG)
                    .companion,
            ).toBeNull();
            expect(
                overrideParticipantOf(snapshotWith(fenrirAt(60)), NO_PETS)
                    .companion,
            ).toBeNull();
        });

        it.each([1, 100])(
            'accepts a companion life from 1 to its maximum, 1 meaning defeated (D-17, D-26): %p',
            (companionLifeAfter) => {
                expect(
                    correcting(fenrirAt(60), companionLifeAfter).get(A)
                        ?.companionLifeAfter,
                ).toBe(companionLifeAfter);
            },
        );

        it('bounds the correction by the maximum of the companion level (D-38)', () => {
            const veteran: OwnedPetEntry = {
                pet: WOLF_ID,
                xp: 100,
                currentLifePoints: 150,
                level: 10,
            };

            expect(
                overrideParticipantOf(snapshotWith(veteran), PET_CATALOG)
                    .companion,
            ).toEqual({ lifeBefore: 150, maxLifePoints: 200 });
            expect(correcting(veteran, 150).get(A)?.companionLifeAfter).toBe(
                150,
            );
            expect(codeOf(() => correcting(veteran, 201))).toBe(
                GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
            );
        });

        it.each([0, 101, 1.5, -1])(
            'refuses a companion life outside its range (D-33): %p',
            (companionLifeAfter) => {
                expect(
                    codeOf(() => correcting(fenrirAt(60), companionLifeAfter)),
                ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
            },
        );

        it('refuses a companion life for a participant without a companion (D-33)', () => {
            expect(codeOf(() => correcting(null, 1))).toBe(
                GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
            );
            expect(
                codeOf(() =>
                    validateOverrides(
                        [overrideOf({ characterId: B, companionLifeAfter: 1 })],
                        participants,
                    ),
                ),
            ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        });

        it('leaves the companion life out when it is not given (D-17)', () => {
            const effects = validateOverrides(
                [overrideOf({ hpAfter: 300, companionLifeAfter: null })],
                [
                    overrideParticipantOf(
                        snapshotWith(fenrirAt(60)),
                        PET_CATALOG,
                    ),
                ],
            );

            expect(effects.get(A)).not.toHaveProperty('companionLifeAfter');
            expect(
                validateOverrides([overrideOf()], participants).get(A),
            ).not.toHaveProperty('companionLifeAfter');
        });
    });
});
