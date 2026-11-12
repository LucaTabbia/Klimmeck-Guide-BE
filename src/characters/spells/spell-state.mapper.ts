import type { SpellState } from 'src/models/character/spell-state.model';

// populate lascia null le magie cancellate dal catalogo (Pitfall 3): solo gli oggetti con id sono magie servibili
function isServable(state: SpellState): boolean {
    const id = (state.spell as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string';
}

// sul filo (Phase 19 D-07, D-16): le sole voci con la magia ancora a catalogo, nell'ordine di apprendimento
export function spellStatesOnTheWire(
    states: readonly SpellState[] | null | undefined,
): SpellState[] {
    return (states ?? []).filter(isServable);
}
