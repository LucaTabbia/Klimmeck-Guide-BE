import { checkContent } from 'src/content/checking/check-content';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';
import {
    CONTENT_COLLECTIONS,
    ContentTree,
    loadContentTree,
} from 'src/content/loading/content-tree';

function repositoryIdsOf(tree: ContentTree): unknown[] {
    const entryIds = CONTENT_COLLECTIONS.flatMap((collection) =>
        tree.entries[collection].map((entry) => entry.raw.id),
    );
    const worldIds = (tree.world ?? []).flatMap((city) => [
        city.id,
        ...city.pointsOfInterest.map((poi) => poi.id),
    ]);
    return [...entryIds, ...worldIds];
}

function duplicatesOf(ids: readonly unknown[]): unknown[] {
    return ids.filter((id, index) => ids.indexOf(id) !== index);
}

// gate di ogni piano di stesura: il vero albero content/ resta caricabile e senza errori
describe('repository content tree', () => {
    const tree = loadContentTree(DEFAULT_CONTENT_DIR);

    it('keeps the repository content tree loadable (BE-CONTENT-01)', () => {
        expect(checkContent(tree).errors).toEqual([]);
    });

    it('keeps every repository id unique across collections', () => {
        expect(duplicatesOf(repositoryIdsOf(tree))).toEqual([]);
    });
});
