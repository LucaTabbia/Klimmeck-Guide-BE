import type { ActiveSpell } from 'src/models/common/active-spell.model';
import type { SpellState } from 'src/models/character/spell-state.model';

export interface SpellsOnTheWire {
    spellStates: SpellState[];
    activeSpells: ActiveSpell[];
}

// populate lascia null le magie cancellate dal catalogo (Pitfall 3): solo gli oggetti con id sono magie servibili
function isServable(state: SpellState): boolean {
    const id = (state.spell as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string';
}

// sul filo (Phase 19 D-07, D-16): le voci con la magia ancora a catalogo; le equipaggiate sono le voci attive, nell'ordine di apprendimento e con gli usi della voce (lista derivata fino alla contrazione dello SDL)
export function spellsOnTheWire(status: {
    spellStates: SpellState[];
}): SpellsOnTheWire {
    const spellStates = (status.spellStates ?? []).filter(isServable);
    const activeSpells = spellStates
        .filter((state) => state.active === true)
        .map((state) => ({ spell: state.spell, usages: state.usages }));
    return { spellStates, activeSpells };
}
