import { Types } from 'mongoose';
import {
    learnedSpellState,
    recoveryDueAt,
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

        it('keeps the active flag when spending usages (D-07)', () => {
            const entry = {
                spell: s,
                usages: 3,
                recoveries: [t300],
                active: true,
            };

            expect(spendFromState(entry, 1, t100)).toEqual({
                spell: s,
                usages: 2,
                recoveries: [t100, t300],
                active: true,
            });
        });
    });

    it('starts a learned spell as not active (D-07)', () => {
        expect(learnedSpellState(s, 3)).toEqual({
            spell: s,
            usages: 3,
            recoveries: [],
            active: false,
        });
    });

    it('recoveryDueAt adds the catalog recovery time in milliseconds', () => {
        expect(recoveryDueAt(new Date(1000), 2500)).toEqual(new Date(3500));
    });
});
