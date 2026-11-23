import { documentIdOf } from 'src/mongo/document-id';
import { isVisible, LoreVisibility, refHexOf } from './lore-visibility';

// la creatura di una lore (quick 261123-lcv): il nemico o il pet che la porta fra le sue relatedLore;
// esce solo se la lore è visibile al viewer, con la stessa regola di ogni relatedLore (isVisible)

export interface LoreCreature {
    _id?: unknown;
    relatedLore?: unknown;
}

export function visibleLoreHexOf(
    visibility: LoreVisibility,
    lore: unknown,
): string | undefined {
    return isVisible(visibility, lore) ? refHexOf(lore) : undefined;
}

// «al più una creatura per lore» è una regola del contenuto, non dello schema: se sono di più vince l'id più piccolo, senza errore
export function creaturesByLore<T extends LoreCreature>(
    creatures: readonly T[],
): Map<string, T> {
    const byLore = new Map<string, T>();
    for (const creature of creatures) {
        for (const lore of loreHexesOf(creature)) {
            const current = byLore.get(lore);
            if (!current || comesBefore(creature, current)) {
                byLore.set(lore, creature);
            }
        }
    }
    return byLore;
}

function loreHexesOf(creature: LoreCreature): string[] {
    const related: unknown[] = Array.isArray(creature.relatedLore)
        ? creature.relatedLore
        : [];
    return related
        .map(refHexOf)
        .filter((hex): hex is string => hex !== undefined);
}

function comesBefore(creature: unknown, other: unknown): boolean {
    return (documentIdOf(creature) ?? '') < (documentIdOf(other) ?? '');
}
