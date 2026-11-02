import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { loadContentTree } from 'src/content/loading/content-tree';
import { validateTreeEntries } from 'src/content/schema/validate-tree';

const FIXTURES_DIR = join(
    __dirname,
    '..',
    '..',
    '..',
    'test',
    'content-fixtures',
);

describe('validateTreeEntries', () => {
    let dir: string;

    function write(relative: string, lines: string[]): void {
        const path = join(dir, relative);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, [...lines, ''].join('\n'));
    }

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'content-schema-'));
        copyFileSync(
            join(FIXTURES_DIR, 'config.yaml'),
            join(dir, 'config.yaml'),
        );
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('accepts the test content tree', () => {
        const tree = loadContentTree(FIXTURES_DIR);

        expect(tree.issues).toEqual([]);
        expect(validateTreeEntries(tree)).toEqual([]);
        expect(tree.entries.lore).toHaveLength(3);
        expect(tree.entries.enemies).toHaveLength(2);
        expect(tree.entries.quests).toHaveLength(5);
        expect(tree.fixes).toHaveLength(4);
        expect(tree.world).toHaveLength(2);
    });

    it('reports each invalid entry once with its file (D-28)', () => {
        write('lore/rotta.yaml', [
            "- id: '64b0000000000000000000a9'",
            '  type: town',
            '  name: Lore rotta',
            '  description: Una voce di tipo sconosciuto.',
        ]);
        write('fixes/rotti.yaml', ['- key: generico', '  kind: setAnything']);

        const issues = validateTreeEntries(loadContentTree(dir));

        expect(issues).toEqual([
            expect.objectContaining({
                file: 'lore/rotta.yaml',
                line: 1,
                entryId: '64b0000000000000000000a9',
                path: 'type',
            }),
            expect.objectContaining({
                file: 'fixes/rotti.yaml',
                line: 1,
                entryId: 'generico',
                path: 'kind',
            }),
        ]);
    });

    it('checks the world snapshot and the image links (D-24)', () => {
        write('world/cities.yaml', [
            "- id: '64b0000000000000000000c1'",
            '  name: Borgo senza marker',
            '  type: drusteaVillage',
            '  relatedLore: null',
            '  pointsOfInterest: []',
        ]);
        write('images.yaml', [
            'lore:',
            "  - { id: '64b0000000000000000000a1', url: 'http://example.com/x.png' }",
            'enemies: []',
            'pets: []',
        ]);

        const issues = validateTreeEntries(loadContentTree(dir));

        expect(issues).toEqual([
            expect.objectContaining({
                file: 'world/cities.yaml',
                line: 1,
                path: 'markerLocation',
            }),
            expect.objectContaining({
                file: 'images.yaml',
                line: null,
                entryId: '64b0000000000000000000a1',
                path: 'lore.0.url',
            }),
        ]);
    });
});
