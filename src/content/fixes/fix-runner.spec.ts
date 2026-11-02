import { Db } from 'mongodb';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';
import { loadContentTree } from 'src/content/loading/content-tree';
import { validateTreeEntries } from 'src/content/schema/validate-tree';
import { runFixes } from './fix-runner';
import { normalizedPoiTypes, unknownPoiTypes } from './poi-and-city-fixes';

const REPAIRS: Record<string, string> = {
    belleholmIsand: 'belleholmIsland',
    BelleholmIsland: 'belleholmIsland',
    NULLbelleholmIsland: 'belleholmIsland',
    ValanPlains: 'valanPlains',
    'vulcano ': 'vulcano',
    gounet: 'glounet',
};

describe('point of interest type repairs', () => {
    it('normalizes the dirty point of interest types and removes duplicates (D-06)', () => {
        expect(
            normalizedPoiTypes(
                ['NULLbelleholmIsland', 'belleholmIsland', 'forest'],
                REPAIRS,
            ),
        ).toEqual(['belleholmIsland', 'forest']);
    });

    it('keeps a type that the replacements do not mention', () => {
        expect(normalizedPoiTypes(['hills', 'vulcano '], REPAIRS)).toEqual([
            'hills',
            'vulcano',
        ]);
    });

    it('flags a result outside the PoiType enum', () => {
        expect(
            unknownPoiTypes(normalizedPoiTypes(['gounet', 'swampy'], REPAIRS)),
        ).toEqual(['swampy']);
    });
});

describe('runFixes', () => {
    it('rejects a fix entry that does not pass the schema (T-11-25)', async () => {
        const fix = {
            file: 'fixes/rotto.yaml',
            line: 1,
            raw: { key: 'rotto', kind: 'renameCity', target: 'abc' },
        };

        await expect(runFixes({} as Db, [fix], 'dry-run')).rejects.toThrow(
            'Correzione non valida: rotto',
        );
    });
});

describe('repository fix files', () => {
    it('accepts the repository fix files', () => {
        const tree = loadContentTree(DEFAULT_CONTENT_DIR);
        const fixIssues = [...tree.issues, ...validateTreeEntries(tree)].filter(
            (issue) => issue.file.startsWith('fixes/'),
        );

        expect(fixIssues).toEqual([]);
        expect(tree.fixes.map((fix) => fix.raw.kind)).toEqual([
            'deleteQuests',
            'renameCity',
            'unsetLoreUnlocked',
            ...Array<string>(6).fill('normalizePoiTypes'),
        ]);
        for (const fix of tree.fixes.slice(3)) {
            expect(fix.raw.replacements).toEqual(REPAIRS);
        }
    });
});
