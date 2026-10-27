import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
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

const A = A_ID.toHexString();
const B = B_ID.toHexString();
const POTION = POTION_ID.toHexString();
const S1 = S1_ID.toHexString();

const participants: OverrideParticipant[] = [
    {
        characterId: A_ID,
        currentLifePoints: 600,
        maxLifePoints: 1000,
        ownedLoot: new Map([[POTION, 2]]),
        activeSpells: new Map([[S1, 2]]),
    },
    {
        characterId: B_ID,
        currentLifePoints: 1000,
        maxLifePoints: 1200,
        ownedLoot: new Map(),
        activeSpells: new Map(),
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
        const participant = overrideParticipantOf({
            _id: A_ID,
            status: {
                xp: 0,
                title: TitleType.rookie,
                currentLifePoints: 600,
                maxLifePoints: 1000,
                spells: [S1_ID],
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
                activeSpells: [
                    { spell: S1_ID, usages: 2 },
                    { spell: 'not-an-id', usages: 4 },
                ],
            },
        });

        expect(participant.characterId).toBe(A_ID);
        expect(participant.currentLifePoints).toBe(600);
        expect(participant.maxLifePoints).toBe(1000);
        expect([...participant.ownedLoot.entries()]).toEqual([[POTION, 2]]);
        expect([...participant.activeSpells.entries()]).toEqual([[S1, 2]]);
    });

    const divergentSnapshot = () => ({
        _id: A_ID,
        status: {
            xp: 0,
            title: TitleType.rookie,
            spells: [S1_ID, INACTIVE_SPELL_ID],
            spellStates: [
                { spell: S1_ID, usages: 1, recoveries: [] },
                { spell: INACTIVE_SPELL_ID, usages: 5, recoveries: [] },
            ],
        },
        assets: { activeSpells: [{ spell: S1_ID, usages: 3 }] },
    });

    it('reads the usages of a character not migrated yet from its spell slots', () => {
        const participant = overrideParticipantOf({
            _id: A_ID,
            status: { xp: 0, title: TitleType.rookie, spells: [S1_ID] },
            assets: { activeSpells: [{ spell: S1_ID, usages: 2 }] },
        });

        expect([...participant.activeSpells.entries()]).toEqual([[S1, 2]]);
    });

    it('takes the usages of the active spells from the spell state, never from the slots', () => {
        const participant = overrideParticipantOf(divergentSnapshot());

        expect([...participant.activeSpells.entries()]).toEqual([[S1, 1]]);
    });

    it('rejects an override that spends more usages than the spell state holds', () => {
        const participant = overrideParticipantOf(divergentSnapshot());
        const spending = (usages: number) => () =>
            validateOverrides(
                [overrideOf({ spellsUsed: [{ spell: S1, usages }] })],
                [participant],
            );

        expect(spending(2)).toThrow(
            expect.objectContaining({
                code: GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
                message: 'Esito non valido per questo personaggio',
            }),
        );
        expect(codeOf(spending(1))).toBeUndefined();
        expect(spending(1)().get(A)?.spellsUsed).toEqual([
            { spellId: S1, usages: 1 },
        ]);
    });

    it('falls back to the level table for a legacy snapshot', () => {
        const participant = overrideParticipantOf({
            _id: B_ID,
            status: { title: TitleType.rookie },
        });

        expect(participant.maxLifePoints).toBeGreaterThan(0);
        expect(participant.currentLifePoints).toBe(participant.maxLifePoints);
        expect(participant.ownedLoot.size).toBe(0);
        expect(participant.activeSpells.size).toBe(0);
    });
});
