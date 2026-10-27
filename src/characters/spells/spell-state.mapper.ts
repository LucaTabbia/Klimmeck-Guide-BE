import type { ActiveSpell } from 'src/models/common/active-spell.model';
import type { SpellState } from 'src/models/character/spell-state.model';
import type { Spell } from 'src/models/spell.model';
import { refIdOf } from 'src/mongo/document-id';

export interface SpellsOnTheWire {
    spellStates: SpellState[];
    activeSpells: ActiveSpell[];
}

// populate lascia null le magie cancellate dal catalogo (Pitfall 3): solo gli oggetti con id sono magie servibili
function populatedIdOf(value: unknown): string | undefined {
    const id = (value as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' ? id : undefined;
}

// lo slot non è popolato: ref ObjectId o, da dati legacy, stringa esadecimale (04 Pitfall 1)
function slotIdOf(entry: ActiveSpell): string | undefined {
    return refIdOf(entry.spell)?.toHexString() ?? populatedIdOf(entry.spell);
}

// sul filo (D-04a, D-05): usi dalla voce di stato, ordine degli slot, voci orfane o non conosciute scartate come status.spells
export function spellsOnTheWire(
    status: { spells: Spell[]; spellStates: SpellState[] },
    active: ActiveSpell[],
): SpellsOnTheWire {
    const known = new Map<string, Spell>();
    for (const spell of status.spells ?? []) {
        const id = populatedIdOf(spell);
        if (id) known.set(id, spell);
    }

    const spellStates = (status.spellStates ?? []).filter((state) => {
        const id = populatedIdOf(state.spell);
        return id !== undefined && known.has(id);
    });
    const usagesOf = new Map(
        spellStates.map((state) => [populatedIdOf(state.spell), state.usages]),
    );

    const activeSpells = (active ?? []).flatMap((entry) => {
        const id = slotIdOf(entry);
        const spell = id ? known.get(id) : undefined;
        if (!spell) return [];
        return [{ spell, usages: usagesOf.get(id) ?? entry.usages }];
    });

    return { spellStates, activeSpells };
}
