import type { SpellState } from 'src/models/character/spell-state.model';
import type { Spell } from 'src/models/spell.model';
import { spellsOnTheWire } from './spell-state.mapper';

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

describe('spellsOnTheWire', () => {
    const a = populatedSpell('Dardo', 'a'.repeat(24));
    const b = populatedSpell('Scudo', 'b'.repeat(24));
    const c = populatedSpell('Lampo', 'c'.repeat(24));
    const t1 = new Date(1_000);
    const t2 = new Date(2_000);

    it('serves the spell states whose spell is still in the catalogue (D-07)', () => {
        const wire = spellsOnTheWire({
            spellStates: [
                state(b, 1, false, [t2]),
                state(null, 2, true),
                state({ name: 'senza id' } as Spell, 2, true),
                state(a, 0, true, [t1]),
            ],
        });

        expect(wire).toEqual({
            spellStates: [state(b, 1, false, [t2]), state(a, 0, true, [t1])],
            activeSpells: [{ spell: a, usages: 0 }],
        });
    });

    it('derives the active spells from the active states in the learning order (D-16)', () => {
        const wire = spellsOnTheWire({
            spellStates: [
                state(a, 2, true),
                state(b, 1, false),
                state(c, 0, true),
            ],
        });

        expect(wire.activeSpells).toEqual([
            { spell: a, usages: 2 },
            { spell: c, usages: 0 },
        ]);
        expect(wire.activeSpells[0].spell).toBe(a);
    });

    it('reads a spell state stored without the flag as not active', () => {
        const wire = spellsOnTheWire({ spellStates: [state(a, 3)] });

        expect(wire).toEqual({
            spellStates: [state(a, 3)],
            activeSpells: [],
        });
    });

    it('tolerates a missing list of spell states', () => {
        const wire = spellsOnTheWire({
            spellStates: undefined as unknown as SpellState[],
        });

        expect(wire).toEqual({ spellStates: [], activeSpells: [] });
    });

    it('returns new lists and leaves its input untouched', () => {
        const spellStates = [state(a, 1, true, [t1]), state(null, 2)];
        const before = spellStates.map((entry) => ({ ...entry }));

        const wire = spellsOnTheWire({ spellStates });

        expect(wire.spellStates).not.toBe(spellStates);
        expect(spellStates).toEqual(before);
    });
});
