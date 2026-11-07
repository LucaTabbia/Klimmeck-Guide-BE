import { documentIdOf, refIdOf } from 'src/mongo/document-id';
import { isResolvedRef } from 'src/quests/quest-catalog.populate';

// chi vede cosa (Phase 16 D-07, D-10): l'innkeeper tutto, il giocatore i suoi due insiemi, nessun personaggio nulla; confronto per esadecimale su ogni forma di ref

export type LoreVisibility =
    | { all: true }
    | {
          all: false;
          lore: ReadonlySet<string>;
          enemies: ReadonlySet<string>;
      };

export const SEES_EVERYTHING: LoreVisibility = { all: true };
export const SEES_NOTHING: LoreVisibility = {
    all: false,
    lore: new Set<string>(),
    enemies: new Set<string>(),
};

export function refHexOf(ref: unknown): string | undefined {
    return documentIdOf(ref) ?? refIdOf(ref)?.toHexString();
}

const isString = (value: string | undefined): value is string =>
    typeof value === 'string';

function hexSetOf(list: readonly unknown[]): ReadonlySet<string> {
    return new Set(list.map(refHexOf).filter(isString));
}

export function visibilityOf(
    status:
        | {
              unlockedLore?: unknown[] | null;
              knownEnemies?: unknown[] | null;
          }
        | null
        | undefined,
): LoreVisibility {
    if (!status) return SEES_NOTHING;
    return {
        all: false,
        lore: hexSetOf(status.unlockedLore ?? []),
        enemies: hexSetOf(status.knownEnemies ?? []),
    };
}

function includesRef(set: ReadonlySet<string>, ref: unknown): boolean {
    const hex = refHexOf(ref);
    return hex !== undefined && set.has(hex);
}

export function isVisible(visibility: LoreVisibility, ref: unknown): boolean {
    return visibility.all || includesRef(visibility.lore, ref);
}

export function knowsEnemy(visibility: LoreVisibility, ref: unknown): boolean {
    return visibility.all || includesRef(visibility.enemies, ref);
}

// un ref non popolato (orfano o refPath irrisolto) annullerebbe [Lore!]! sul filo anche per l'innkeeper (Pitfall 9)
export function visibleRelated<T>(
    visibility: LoreVisibility,
    related: readonly T[] | null | undefined,
): T[] {
    return (related ?? []).filter(
        (entry) => isResolvedRef(entry) && isVisible(visibility, entry),
    );
}
