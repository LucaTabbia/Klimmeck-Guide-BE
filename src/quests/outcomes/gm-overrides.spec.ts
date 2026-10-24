import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import {
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
            const outcomes = validateOverrides(overrides, participants);

            expect([...outcomes.entries()]).toEqual([
                [A, null],
                [B, null],
            ]);
        },
    );

    it('turns a full override into the participant outcome', () => {
        const outcomes = validateOverrides(
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

        expect(outcomes.get(A)).toEqual({
            characterId: A,
            outcome: 'success',
            hpAfter: 300,
            injuriesAdded: [InjuryType.deepCut],
            consumablesUsed: [{ itemId: POTION, quantity: 1 }],
            spellsUsed: [{ spellId: S1, usages: 2 }],
        });
        expect(outcomes.get(B)).toBeNull();
    });

    it('keeps the current life points when the override has only injuries', () => {
        const outcomes = validateOverrides(
            [overrideOf({ injuries: [InjuryType.fracturedRib] })],
            participants,
        );

        expect(outcomes.get(A)).toEqual({
            characterId: A,
            outcome: 'success',
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
        const outcomes = validateOverrides(
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

        expect(outcomes.get(A)?.consumablesUsed).toEqual([
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
