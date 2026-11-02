import { join } from 'path';
import {
    ContentCollection,
    ContentTree,
    loadContentTree,
    WorldCity,
} from 'src/content/loading/content-tree';
import { LoadedEntry } from 'src/content/loading/yaml-file';

export const TEST_CONTENT_DIR = join(__dirname, '..', 'content-fixtures');

// ogni spec lavora su una copia fresca del mini-albero e la muta in memoria
export function loadTestContentTree(): ContentTree {
    return loadContentTree(TEST_CONTENT_DIR);
}

export function entryOf(
    tree: ContentTree,
    collection: ContentCollection,
    id: string,
): Record<string, unknown> {
    const entry = tree.entries[collection].find(
        (loaded) => loaded.raw.id === id,
    );
    if (!entry) throw new Error(`voce di prova assente: ${collection} ${id}`);
    return entry.raw;
}

export function addEntry(
    tree: ContentTree,
    collection: ContentCollection,
    raw: Record<string, unknown>,
): LoadedEntry {
    const entry = {
        file: `${collection}/aggiunte.yaml`,
        line: tree.entries[collection].length + 1,
        raw,
    };
    tree.entries[collection].push(entry);
    return entry;
}

export function addCity(tree: ContentTree, city: WorldCity): void {
    tree.world = [...(tree.world ?? []), city];
}
