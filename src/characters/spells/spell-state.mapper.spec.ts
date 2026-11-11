import type { SpellState } from 'src/models/character/spell-state.model';
import type { Spell } from 'src/models/spell.model';
import { spellStatesOnTheWire } from './spell-state.mapper';

// come dopo il populate: oggetti Spell con id esadecimale
function populatedSpell(name: string, id: string): Spell {
    return { id, name } as Spell;
}

function state(
    spell: Spell | null,
    usages: number,
    active?: boolean,
    recoveries: Date[] = [],
): SpellState {
    return { spell, usages, recoveries, active } as SpellState;
}

describe('spellStatesOnTheWire', () => {
    const a = populatedSpell('Dardo', 'a'.repeat(24));
    const b = populatedSpell('Scudo', 'b'.repeat(24));
    const c = populatedSpell('Lampo', 'c'.repeat(24));
    const t1 = new Date(1_000);
    const t2 = new Date(2_000);

    it('serves the spell states whose spell is populated, in the learning order (D-07, D-16)', () => {
        const states = [
            state(c, 2, true),
            state(a, 1, false, [t2]),
            state(b, 0, true, [t1]),
        ];

        const wire = spellStatesOnTheWire(states);

        expect(wire).toEqual(states);
        expect(wire.map((entry) => entry.spell)).toEqual([c, a, b]);
        expect(wire[0]).toBe(states[0]);
    });

    it('drops the state of a spell that is gone from the catalogue (D-07)', () => {
        const wire = spellStatesOnTheWire([
            state(b, 1, false, [t2]),
            state(null, 2, true),
            state({ name: 'senza id' } as Spell, 2, true),
            state(a, 0, true, [t1]),
        ]);

        expect(wire).toEqual([
            state(b, 1, false, [t2]),
            state(a, 0, true, [t1]),
        ]);
    });

    it('reads a missing list as empty (D-07)', () => {
        expect(spellStatesOnTheWire(undefined)).toEqual([]);
        expect(spellStatesOnTheWire(null)).toEqual([]);
    });

    it('returns a new list and leaves its input untouched (D-07)', () => {
        const spellStates = [state(a, 1, true, [t1]), state(null, 2)];
        const before = spellStates.map((entry) => ({ ...entry }));

        const wire = spellStatesOnTheWire(spellStates);

        expect(wire).not.toBe(spellStates);
        expect(spellStates).toEqual(before);
    });
});
