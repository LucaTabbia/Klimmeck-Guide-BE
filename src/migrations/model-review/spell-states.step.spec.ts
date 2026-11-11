// UNA TANTUM (Phase 19 D-12): tabella della fusione delle tre liste di magie del personaggio in una sola — esce dal repo dopo il boot reale
import { Types } from 'mongoose';
import { mergeSpellLists } from './spell-states.step';

const FIREBALL = new Types.ObjectId('64d000000000000000000001');
const FROST = new Types.ObjectId('64d000000000000000000002');
const SPARK = new Types.ObjectId('64d000000000000000000003');
const UNKNOWN = new Types.ObjectId('64d0000000000000000000ff');

const MAX_USAGES = new Map<string, number>([
    [FIREBALL.toHexString(), 3],
    [FROST.toHexString(), 5],
]);

const NO_ANOMALY = { usageConflicts: 0, unknownActive: [], droppedStates: [] };

const stateOf = (spell: unknown, usages: number, recoveries: Date[] = []) => ({
    spell,
    usages,
    recoveries,
});

const entryOf = (
    spell: Types.ObjectId,
    usages: number,
    active = false,
    recoveries: Date[] = [],
) => ({ spell, usages, recoveries, active });

describe('mergeSpellLists', () => {
    it('builds one entry per known spell in the learning order (D-07, D-16)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST, FIREBALL, SPARK],
                    spellStates: [
                        stateOf(FROST, 4),
                        stateOf(FIREBALL, 2),
                        stateOf(SPARK, 1),
                    ],
                    activeSpells: [],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [
                entryOf(FROST, 4),
                entryOf(FIREBALL, 2),
                entryOf(SPARK, 1),
            ],
            ...NO_ANOMALY,
        });
    });

    it('marks as active the spells that were equipped (D-07)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST, FIREBALL, SPARK],
                    spellStates: [
                        stateOf(FROST, 4),
                        stateOf(FIREBALL, 2),
                        stateOf(SPARK, 1),
                    ],
                    activeSpells: [
                        { spell: SPARK, usages: 1 },
                        { spell: FROST, usages: 4 },
                    ],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [
                entryOf(FROST, 4, true),
                entryOf(FIREBALL, 2),
                entryOf(SPARK, 1, true),
            ],
            ...NO_ANOMALY,
        });
    });

    it('finds the state by id when the index does not match (D-07)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST, FIREBALL],
                    spellStates: [stateOf(FIREBALL, 2), stateOf(FROST, 4)],
                    activeSpells: [],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FROST, 4), entryOf(FIREBALL, 2)],
            ...NO_ANOMALY,
        });
    });

    it('lets the usages of the state win over the equipped copy and counts the conflict (D-07)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST, FIREBALL],
                    spellStates: [stateOf(FROST, 4), stateOf(FIREBALL, 2)],
                    activeSpells: [
                        { spell: FROST, usages: 1 },
                        { spell: FIREBALL, usages: 2 },
                    ],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FROST, 4, true), entryOf(FIREBALL, 2, true)],
            usageConflicts: 1,
            unknownActive: [],
            droppedStates: [],
        });
    });

    it.each([
        ['the equipped usages', [{ spell: FIREBALL, usages: 1 }], FIREBALL, 1],
        ['the catalogue maximum', [], FIREBALL, 3],
        ['0 without a catalogue maximum', [], SPARK, 0],
    ])(
        'fills a missing state from the equipped usages, then from the catalogue, then with 0: %s (D-07)',
        (_source, activeSpells, spell, usages) => {
            expect(
                mergeSpellLists(
                    { spells: [spell], spellStates: [], activeSpells },
                    MAX_USAGES,
                ),
            ).toEqual({
                spellStates: [entryOf(spell, usages, activeSpells.length > 0)],
                ...NO_ANOMALY,
            });
        },
    );

    it('keeps the recovery instants of the state (D-07)', () => {
        const recoveries = [
            new Date('2026-11-11T10:00:00.000Z'),
            new Date('2026-11-11T11:00:00.000Z'),
        ];

        expect(
            mergeSpellLists(
                {
                    spells: [FIREBALL, FROST],
                    spellStates: [
                        stateOf(FIREBALL, 1, recoveries),
                        { spell: FROST, usages: 5 },
                    ],
                    activeSpells: [],
                },
                MAX_USAGES,
            ).spellStates,
        ).toEqual([entryOf(FIREBALL, 1, false, recoveries), entryOf(FROST, 5)]);
    });

    it('creates no entry for an equipped spell that is not known and reports its id (D-07, C-WR-01)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FIREBALL],
                    spellStates: [stateOf(FIREBALL, 2)],
                    activeSpells: [{ spell: UNKNOWN, usages: 1 }],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FIREBALL, 2)],
            usageConflicts: 0,
            unknownActive: [UNKNOWN.toHexString()],
            droppedStates: [],
        });
    });

    it('leaves out the legacy state of a spell that is not known and reports its id (D-07, C-WR-01)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FIREBALL],
                    spellStates: [stateOf(FIREBALL, 2), stateOf(UNKNOWN, 1)],
                    activeSpells: [],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FIREBALL, 2)],
            usageConflicts: 0,
            unknownActive: [],
            droppedStates: [UNKNOWN.toHexString()],
        });
    });

    it('reports a left out state without a readable spell by a placeholder (C-WR-01)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FIREBALL],
                    spellStates: [
                        stateOf(FIREBALL, 2),
                        stateOf('non-un-id', 1),
                        { ...stateOf(undefined, 1), active: true },
                    ],
                    activeSpells: [{ usages: 1 }],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FIREBALL, 2)],
            usageConflicts: 0,
            unknownActive: ['<senza riferimento>'],
            droppedStates: ['<senza riferimento>', '<senza riferimento>'],
        });
    });

    it('keeps an entry written by the new code even if its spell is not in the old known list (C-WR-01)', () => {
        const recoveries = [new Date('2026-11-11T10:00:00.000Z')];

        expect(
            mergeSpellLists(
                {
                    spells: [FIREBALL],
                    spellStates: [
                        { ...stateOf(SPARK, 1, recoveries), active: false },
                        stateOf(FIREBALL, 2),
                        { ...stateOf(FROST, 4), active: true },
                    ],
                    activeSpells: [],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [
                entryOf(FIREBALL, 2),
                entryOf(SPARK, 1, false, recoveries),
                entryOf(FROST, 4, true),
            ],
            ...NO_ANOMALY,
        });
    });

    it('keeps one entry per spell when the new code wrote a double (C-WR-01)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FIREBALL],
                    spellStates: [
                        stateOf(FIREBALL, 2),
                        { ...stateOf(FIREBALL, 3), active: true },
                        { ...stateOf(SPARK, 1), active: true },
                        { ...stateOf(SPARK, 0), active: false },
                    ],
                    activeSpells: [],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FIREBALL, 2), entryOf(SPARK, 1, true)],
            usageConflicts: 0,
            unknownActive: [],
            droppedStates: [FIREBALL.toHexString(), SPARK.toHexString()],
        });
    });

    it('lets a boolean flag of the state win over the old equipped list (C-WR-01)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST, FIREBALL, SPARK],
                    spellStates: [
                        { ...stateOf(FROST, 4), active: true },
                        { ...stateOf(FIREBALL, 2), active: false },
                        stateOf(SPARK, 1),
                    ],
                    activeSpells: [
                        { spell: FIREBALL, usages: 2 },
                        { spell: SPARK, usages: 1 },
                    ],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [
                entryOf(FROST, 4, true),
                entryOf(FIREBALL, 2),
                entryOf(SPARK, 1, true),
            ],
            ...NO_ANOMALY,
        });
    });

    it('reads the known spells from the states when the old list is already gone (D-07)', () => {
        expect(
            mergeSpellLists(
                {
                    spellStates: [stateOf(FROST, 4), stateOf(FIREBALL, 2)],
                    activeSpells: [{ spell: FIREBALL, usages: 2 }],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FROST, 4), entryOf(FIREBALL, 2, true)],
            ...NO_ANOMALY,
        });
    });

    it('keeps the flag of the state when the equipped list is already gone (D-07)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST, FIREBALL],
                    spellStates: [
                        { ...stateOf(FROST, 4), active: true },
                        stateOf(FIREBALL, 2),
                    ],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FROST, 4, true), entryOf(FIREBALL, 2)],
            ...NO_ANOMALY,
        });
    });

    it('reads a legacy string reference like an object id (D-07)', () => {
        expect(
            mergeSpellLists(
                {
                    spells: [FROST.toHexString(), 'non-un-id', FIREBALL],
                    spellStates: [
                        stateOf(FROST.toHexString(), 4),
                        stateOf(FIREBALL, 2),
                    ],
                    activeSpells: [
                        { spell: FIREBALL.toHexString(), usages: 2 },
                    ],
                },
                MAX_USAGES,
            ),
        ).toEqual({
            spellStates: [entryOf(FROST, 4), entryOf(FIREBALL, 2, true)],
            ...NO_ANOMALY,
        });
    });

    it('reads absent lists as a character without spells (D-07)', () => {
        expect(mergeSpellLists({}, MAX_USAGES)).toEqual({
            spellStates: [],
            ...NO_ANOMALY,
        });
    });
});
