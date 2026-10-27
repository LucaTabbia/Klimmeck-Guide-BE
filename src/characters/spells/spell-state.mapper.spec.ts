import { Types } from 'mongoose';
import type { ActiveSpell } from 'src/models/common/active-spell.model';
import type { SpellState } from 'src/models/character/spell-state.model';
import type { Spell } from 'src/models/spell.model';
import { spellsOnTheWire } from './spell-state.mapper';

// come dopo il populate: oggetti Spell con id esadecimale
function populatedSpell(name: string): { spell: Spell; ref: Types.ObjectId } {
    const ref = new Types.ObjectId();
    return { spell: { id: ref.toHexString(), name } as Spell, ref };
}

function state(
    spell: Spell | null,
    usages: number,
    recoveries: Date[] = [],
): SpellState {
    return { spell, usages, recoveries } as SpellState;
}

describe('spellsOnTheWire', () => {
    const a = populatedSpell('Dardo');
    const b = populatedSpell('Scudo');
    const t1 = new Date(1_000);
    const t2 = new Date(2_000);

    it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: reads the slot usages from the spell state', () => {
        const wire = spellsOnTheWire(
            {
                spells: [a.spell],
                spellStates: [state(a.spell, 1, [t1, t2])],
            },
            [{ spell: a.ref, usages: 3 }],
        );

        expect(wire.activeSpells).toEqual([{ spell: a.spell, usages: 1 }]);
        expect(wire.activeSpells[0].spell).toBe(a.spell);
    });

    it('keeps the order of the slots, not the order of the known spells', () => {
        const wire = spellsOnTheWire(
            {
                spells: [a.spell, b.spell],
                spellStates: [state(a.spell, 2), state(b.spell, 1)],
            },
            [
                { spell: b.ref, usages: 1 },
                { spell: a.ref, usages: 2 },
            ],
        );

        expect(wire.activeSpells).toEqual([
            { spell: b.spell, usages: 1 },
            { spell: a.spell, usages: 2 },
        ]);
    });

    it('recovers a slot whose ref is a legacy string and populates it', () => {
        const wire = spellsOnTheWire(
            { spells: [a.spell], spellStates: [state(a.spell, 0, [t1])] },
            [
                {
                    spell: a.ref.toHexString(),
                    usages: 2,
                } as unknown as ActiveSpell,
            ],
        );

        expect(wire.activeSpells).toEqual([{ spell: a.spell, usages: 0 }]);
    });

    it('drops an orphan spell state and keeps the others in their order', () => {
        const wire = spellsOnTheWire(
            {
                spells: [a.spell, b.spell],
                spellStates: [
                    state(b.spell, 1, [t2]),
                    state(null, 2),
                    state(a.spell, 0, [t1]),
                ],
            },
            [],
        );

        expect(wire.spellStates).toEqual([
            state(b.spell, 1, [t2]),
            state(a.spell, 0, [t1]),
        ]);
    });

    it('drops the spell state of a spell that is not known', () => {
        const wire = spellsOnTheWire(
            {
                spells: [a.spell],
                spellStates: [state(a.spell, 1), state(b.spell, 2)],
            },
            [],
        );

        expect(wire.spellStates).toEqual([state(a.spell, 1)]);
    });

    it('drops a slot of a spell that is not known or no longer in the catalog', () => {
        const wire = spellsOnTheWire(
            { spells: [a.spell], spellStates: [state(a.spell, 1)] },
            [
                { spell: b.ref, usages: 2 },
                { spell: null, usages: 1 },
                { spell: a.ref, usages: 1 },
                { spell: 'not-an-id', usages: 1 } as unknown as ActiveSpell,
            ],
        );

        expect(wire.activeSpells).toEqual([{ spell: a.spell, usages: 1 }]);
    });

    it('falls back to the slot usages when the spell has no state entry', () => {
        const wire = spellsOnTheWire({ spells: [a.spell], spellStates: [] }, [
            { spell: a.ref, usages: 2 },
        ]);

        expect(wire).toEqual({
            spellStates: [],
            activeSpells: [{ spell: a.spell, usages: 2 }],
        });
    });

    it('tolerates missing spell states and slots', () => {
        const wire = spellsOnTheWire(
            {
                spells: [a.spell],
                spellStates: undefined as unknown as SpellState[],
            },
            undefined as unknown as ActiveSpell[],
        );

        expect(wire).toEqual({ spellStates: [], activeSpells: [] });
    });

    it('returns new lists and leaves its inputs untouched', () => {
        const spells = [a.spell, b.spell];
        const spellStates = [state(a.spell, 1, [t1]), state(null, 2)];
        const active: ActiveSpell[] = [{ spell: a.ref, usages: 3 }];
        const before = {
            spells: [...spells],
            spellStates: spellStates.map((entry) => ({ ...entry })),
            active: active.map((entry) => ({ ...entry })),
        };

        const wire = spellsOnTheWire({ spells, spellStates }, active);

        expect(wire.spellStates).not.toBe(spellStates);
        expect(wire.activeSpells).not.toBe(active);
        expect({ spells, spellStates, active }).toEqual(before);
    });
});
