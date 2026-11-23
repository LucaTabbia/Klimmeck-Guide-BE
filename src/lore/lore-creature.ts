import { documentIdOf } from 'src/mongo/document-id';
import { isVisible, LoreVisibility, refHexOf } from './lore-visibility';

// la creatura di una lore (quick 261123-lcv): il nemico o il pet che l'ha come lore PROPRIA, la prima delle sue relatedLore
// («Goblin» è del Goblin, non del Capo goblin che la porta per seconda); esce solo se la lore è visibile al viewer (isVisible)

export interface LoreCreature {
    _id?: unknown;
    relatedLore?: unknown;
}

export interface CreaturesByOwnLore<T> {
    byLore: Map<string, T>;
    // lore proprie di più creature: regola del contenuto violata, da segnalare
    contested: string[];
}

export function visibleLoreHexOf(
    visibility: LoreVisibility,
    lore: unknown,
): string | undefined {
    return isVisible(visibility, lore) ? refHexOf(lore) : undefined;
}

// una prima voce illeggibile non promuove la seconda: la creatura resta senza lore propria
export function ownLoreHexOf(creature: unknown): string | undefined {
    const related = (creature as LoreCreature | null | undefined)?.relatedLore;
    return Array.isArray(related) ? refHexOf(related[0]) : undefined;
}

// «una creatura per lore propria» è una regola del contenuto, non dello schema: se sono di più vince l'id più piccolo, senza errore
export function creaturesByOwnLore<T extends LoreCreature>(
    creatures: readonly T[],
): CreaturesByOwnLore<T> {
    const byLore = new Map<string, T>();
    const contested = new Set<string>();
    for (const creature of creatures) {
        const lore = ownLoreHexOf(creature);
        if (lore === undefined) continue;
        const current = byLore.get(lore);
        if (current) contested.add(lore);
        if (!current || comesBefore(creature, current)) {
            byLore.set(lore, creature);
        }
    }
    return { byLore, contested: [...contested] };
}

function comesBefore(creature: unknown, other: unknown): boolean {
    return (documentIdOf(creature) ?? '') < (documentIdOf(other) ?? '');
}
