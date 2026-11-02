import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';
import {
    COLLECTION_DIRS,
    CONTENT_COLLECTIONS,
    loadContentTree,
} from 'src/content/loading/content-tree';

const IDS = [
    'a00000000000000000000001',
    'a00000000000000000000002',
    'a00000000000000000000003',
    'a00000000000000000000004',
    'a00000000000000000000005',
    'a00000000000000000000006',
    'a00000000000000000000007',
];

function entryOf(id: string, name: string): string {
    return `- id: '${id}'\n  name: ${name}\n`;
}

describe('loadContentTree', () => {
    let dir: string;

    function write(relative: string, text: string): void {
        const path = join(dir, relative);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
    }

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'content-tree-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('loads every collection folder in load order (D-27)', () => {
        CONTENT_COLLECTIONS.forEach((collection, index) => {
            write(
                `${COLLECTION_DIRS[collection]}/b.yaml`,
                entryOf(IDS[index], `${collection}-b`),
            );
        });
        write('lore/a.yaml', entryOf('b00000000000000000000001', 'lore-a'));
        write('lore/note.txt', 'non è un file di contenuto');

        const tree = loadContentTree(dir);

        expect(Object.keys(tree.entries)).toEqual([...CONTENT_COLLECTIONS]);
        expect(CONTENT_COLLECTIONS).toEqual([
            'lore',
            'spells',
            'equipmentitems',
            'lootitems',
            'enemies',
            'pets',
            'quests',
        ]);
        expect(
            tree.entries.lore.map(({ file, raw }) => [file, raw.name]),
        ).toEqual([
            ['lore/a.yaml', 'lore-a'],
            ['lore/b.yaml', 'lore-b'],
        ]);
        expect(tree.entries.equipmentitems[0].file).toBe('equipment/b.yaml');
        expect(tree.entries.lootitems[0].file).toBe('loot/b.yaml');
        expect(tree.entries.quests[0].raw.id).toBe(IDS[6]);
        expect(tree.dir).toBe(dir);
    });

    it('loads fixes, images and the world snapshot when present', () => {
        write('fixes/poi-types.yaml', entryOf(IDS[0], 'poi-types'));
        write(
            'images.yaml',
            [
                'lore:',
                `  - { id: '${IDS[1]}', url: 'https://example.org/lore.png' }`,
                'enemies: []',
                'pets: []',
                '',
            ].join('\n'),
        );
        write(
            'world/cities.yaml',
            [
                `- id: '${IDS[2]}'`,
                '  name: Valantar',
                '  type: valanCapital',
                `  markerLocation: '${IDS[3]}'`,
                '  relatedLore: null',
                '  pointsOfInterest:',
                `    - { id: '${IDS[3]}', type: [city], location: [12.5, 41.9] }`,
                '',
            ].join('\n'),
        );

        const tree = loadContentTree(dir);

        expect(tree.fixes.map(({ file }) => file)).toEqual([
            'fixes/poi-types.yaml',
        ]);
        expect(tree.images).toEqual({
            lore: [{ id: IDS[1], url: 'https://example.org/lore.png' }],
            enemies: [],
            pets: [],
        });
        expect(tree.world).toEqual([
            {
                id: IDS[2],
                name: 'Valantar',
                type: 'valanCapital',
                markerLocation: IDS[3],
                relatedLore: null,
                pointsOfInterest: [
                    { id: IDS[3], type: ['city'], location: [12.5, 41.9] },
                ],
            },
        ]);
    });

    it('returns a null world and empty images when the files are missing', () => {
        const tree = loadContentTree(dir);

        expect(tree.world).toBeNull();
        expect(tree.images).toEqual({ lore: [], enemies: [], pets: [] });
        expect(tree.fixes).toEqual([]);
        CONTENT_COLLECTIONS.forEach((collection) =>
            expect(tree.entries[collection]).toEqual([]),
        );
    });

    it('reports a missing config as an issue, never a silent default', () => {
        const tree = loadContentTree(dir);

        expect(tree.config).toBeNull();
        expect(tree.issues).toEqual([
            expect.objectContaining({
                file: 'config.yaml',
                line: null,
                entryId: null,
            }),
        ]);
    });

    it('reports the parse errors of every file with its relative path', () => {
        write('spells/rotto.yaml', `- id: 'x'\n  name: Rotto\n`);

        const tree = loadContentTree(dir);

        expect(tree.issues).toContainEqual(
            expect.objectContaining({ file: 'spells/rotto.yaml', line: 1 }),
        );
    });

    it('resolves the default content folder at the repository root', () => {
        expect(DEFAULT_CONTENT_DIR.endsWith('/content')).toBe(true);
        expect(
            existsSync(join(DEFAULT_CONTENT_DIR, '..', 'package.json')),
        ).toBe(true);
    });
});
