import { FixReport } from 'src/content/fixes/fix-report';
import {
    ContentReport,
    emptyContentReport,
    hasDrift,
    hasErrors,
} from './content-report';

function fix(status: FixReport['status']): FixReport {
    return { key: 'k', kind: 'renameCity', status, touched: 0 };
}

function cleanReport(): ContentReport {
    const report = emptyContentReport('verify');
    report.collections.lore.unchanged = 3;
    report.fixes = [fix('done')];
    return report;
}

describe('content report', () => {
    it('finds no drift when everything is unchanged and every fix is done', () => {
        expect(hasDrift(cleanReport())).toBe(false);
        expect(hasErrors(cleanReport())).toBe(false);
    });

    it('finds drift when a document would be modified', () => {
        const report = cleanReport();
        report.collections.spells.modified = 1;
        expect(hasDrift(report)).toBe(true);
    });

    it('finds drift when a document would be inserted', () => {
        const report = cleanReport();
        report.collections.quests.inserted = 2;
        expect(hasDrift(report)).toBe(true);
    });

    it('finds drift when a city lore link would change', () => {
        const report = cleanReport();
        report.cities.relatedLore.modified = 1;
        expect(hasDrift(report)).toBe(true);
    });

    it('finds drift when a fix is pending', () => {
        const report = cleanReport();
        report.fixes.push(fix('pending'));
        expect(hasDrift(report)).toBe(true);
        expect(hasErrors(report)).toBe(false);
    });

    it('finds drift and an error when a fix is blocked', () => {
        const report = cleanReport();
        report.fixes.push(fix('blocked'));
        expect(hasDrift(report)).toBe(true);
        expect(hasErrors(report)).toBe(true);
    });

    it('finds drift and an error when the report carries an error', () => {
        const report = cleanReport();
        report.errors.push({
            file: 'lore/x.yaml',
            line: 1,
            entryId: null,
            path: 'type',
            message: 'valore non ammesso',
        });
        expect(hasDrift(report)).toBe(true);
        expect(hasErrors(report)).toBe(true);
    });

    it('ignores orphans and warnings when looking for drift (D-05)', () => {
        const report = cleanReport();
        report.collections.lore.orphans.push({ id: 'x', name: 'Vecchia' });
        report.warnings.push({
            file: 'world/cities.yaml',
            line: null,
            entryId: null,
            path: '',
            message: 'avviso',
        });
        expect(hasDrift(report)).toBe(false);
    });

    it('starts with an empty report for every managed collection', () => {
        const report = emptyContentReport('dry-run');
        expect(Object.keys(report.collections)).toEqual([
            'lore',
            'spells',
            'equipmentitems',
            'lootitems',
            'enemies',
            'pets',
            'quests',
        ]);
        expect(report.collections.pets).toEqual({
            inserted: 0,
            modified: 0,
            unchanged: 0,
            orphans: [],
            fixes: 0,
            errors: 0,
        });
    });
});
