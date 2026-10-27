import { Types } from 'mongoose';
import {
    learnedSpellState,
    mirrorFromStates,
    NO_SPELL_MAX_USAGES,
    recoveryDueAt,
    spellStatesOrMigrated,
    spendFromState,
    stateEntryOf,
    usagesFromState,
} from './spell-state.snapshot';

describe('spell state snapshot readers', () => {
    const s = new Types.ObjectId();
    const other = new Types.ObjectId();
    const t100 = new Date(100);
    const t300 = new Date(300);

    describe('stateEntryOf', () => {
        it('finds the entry stored with an ObjectId ref', () => {
            const entry = { spell: s, usages: 2, recoveries: [] };

            expect(stateEntryOf([{ spell: other }, entry], s)).toBe(entry);
        });

        it('finds the entry stored with a legacy string ref', () => {
            const entry = { spell: s.toHexString(), usages: 1 };

            expect(stateEntryOf([entry], s)).toBe(entry);
        });

        it('is undefined when the entry or the states are missing', () => {
            expect(stateEntryOf([{ spell: other }], s)).toBeUndefined();
            expect(stateEntryOf(undefined, s)).toBeUndefined();
        });
    });

    describe('usagesFromState', () => {
        it('reads the usages of the entry', () => {
            expect(usagesFromState([{ spell: s, usages: 2 }], s)).toBe(2);
        });

        it('is 0 when the entry is missing and never negative', () => {
            expect(usagesFromState(undefined, s)).toBe(0);
            expect(usagesFromState([{ spell: s }], s)).toBe(0);
            expect(usagesFromState([{ spell: s, usages: -1 }], s)).toBe(0);
        });
    });

    describe('spendFromState', () => {
        it('spends the usages and merges sorted instants keeping duplicates', () => {
            const entry = { spell: s, usages: 3, recoveries: [t300] };

            expect(spendFromState(entry, 2, t100)).toEqual({
                spell: s,
                usages: 1,
                recoveries: [t100, t100, t300],
            });
            expect(entry).toEqual({ spell: s, usages: 3, recoveries: [t300] });
        });

        it('adds no instant without a due date', () => {
            expect(
                spendFromState(
                    { spell: s, usages: 3, recoveries: [t300] },
                    1,
                    null,
                ),
            ).toEqual({ spell: s, usages: 2, recoveries: [t300] });
        });
    });

    it('learnedSpellState starts with every usage and no instant', () => {
        expect(learnedSpellState(s, 4)).toEqual({
            spell: s,
            usages: 4,
            recoveries: [],
        });
    });

    describe('mirrorFromStates', () => {
        it('keeps the ref in its stored form and takes the usages from the state', () => {
            const hexLegacy = s.toHexString();

            expect(
                mirrorFromStates(
                    [{ spell: hexLegacy, usages: 3 }],
                    [{ spell: s, usages: 1 }],
                ),
            ).toEqual([{ spell: hexLegacy, usages: 1 }]);
        });

        it('keeps the usages of an active entry without a state', () => {
            expect(mirrorFromStates([{ spell: other, usages: 2 }], [])).toEqual(
                [{ spell: other, usages: 2 }],
            );
        });

        it('is empty without active spells', () => {
            expect(mirrorFromStates(undefined, [])).toEqual([]);
        });
    });

    it('recoveryDueAt adds the catalog recovery time in milliseconds', () => {
        expect(recoveryDueAt(new Date(1000), 2500)).toEqual(new Date(3500));
    });

    describe('spellStatesOrMigrated', () => {
        it('returns the stored states unchanged, even when empty', () => {
            const spellStates = [{ spell: s, usages: 1, recoveries: [t100] }];

            expect(
                spellStatesOrMigrated(
                    { status: { spells: [s], spellStates } },
                    NO_SPELL_MAX_USAGES,
                ),
            ).toBe(spellStates);
            expect(
                spellStatesOrMigrated(
                    { status: { spells: [s], spellStates: [] } },
                    NO_SPELL_MAX_USAGES,
                ),
            ).toEqual([]);
        });

        it('derives the entries from the known spells like the boot migration', () => {
            const a = new Types.ObjectId();
            const b = new Types.ObjectId();

            const states = spellStatesOrMigrated(
                {
                    status: { spells: [a, b.toHexString(), 'xyz'] },
                    assets: { activeSpells: [{ spell: a, usages: 1 }] },
                },
                new Map([[b.toHexString(), 2]]),
            );

            expect(states).toEqual([
                { spell: a, usages: 1, recoveries: [] },
                { spell: b, usages: 2, recoveries: [] },
            ]);
            expect(states[1].spell).toBeInstanceOf(Types.ObjectId);
        });

        it('falls back to 0 usages for an inactive spell missing from the catalog', () => {
            expect(
                spellStatesOrMigrated(
                    { status: { spells: [s] }, assets: null },
                    NO_SPELL_MAX_USAGES,
                ),
            ).toEqual([{ spell: s, usages: 0, recoveries: [] }]);
        });

        it('is empty for a snapshot without status', () => {
            expect(
                spellStatesOrMigrated({ status: null }, NO_SPELL_MAX_USAGES),
            ).toEqual([]);
        });
    });
});
