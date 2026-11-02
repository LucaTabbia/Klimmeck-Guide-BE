import { join } from 'path';
import { indexContent } from 'src/content/checking/content-index';
import { loadContentTree } from 'src/content/loading/content-tree';

const FIXTURES_DIR = join(
    __dirname,
    '..',
    '..',
    '..',
    'test',
    'content-fixtures',
);

const WOLF_ID = '64b000000000000000000101';
const REGION_ID = '64b0000000000000000000a1';
const SPELL_ID = '64b0000000000000000000b1';
const VILLAGE_ID = '64b0000000000000000000c1';
const FOREST_POI_ID = '64b0000000000000000000d2';

describe('indexContent', () => {
    it('indexes the entries of the test content tree by collection', () => {
        const index = indexContent(loadContentTree(FIXTURES_DIR));

        expect(index.byCollection.lore.size).toBe(3);
        expect(index.byCollection.enemies.size).toBe(2);
        expect(index.byCollection.enemies.get(WOLF_ID)).toMatchObject({
            collection: 'enemies',
            name: 'Lupo di Prova',
            type: 'animal',
            file: 'enemies/esempio.yaml',
            line: 1,
        });
    });

    it('indexes the cities of the snapshot and their points of interest', () => {
        const index = indexContent(loadContentTree(FIXTURES_DIR));

        expect(index.cities.size).toBe(2);
        expect(index.pois.size).toBe(5);
        expect(index.pois.get(FOREST_POI_ID)?.cityId).toBe(VILLAGE_ID);
    });

    it('names every indexed id for the review comments', () => {
        const index = indexContent(loadContentTree(FIXTURES_DIR));

        expect(index.namesById.get(WOLF_ID)).toBe('Lupo di Prova');
        expect(index.namesById.get(VILLAGE_ID)).toBe('Borgo di Prova');
    });

    it('lists an id shared by two collections twice', () => {
        const tree = loadContentTree(FIXTURES_DIR);
        const spell = tree.entries.spells.find(
            (entry) => entry.raw.id === SPELL_ID,
        )!;
        spell.raw.id = REGION_ID;

        const index = indexContent(tree);

        expect(
            index.allIds.get(REGION_ID)?.map((entry) => entry.collection),
        ).toEqual(['lore', 'spells']);
    });
});
