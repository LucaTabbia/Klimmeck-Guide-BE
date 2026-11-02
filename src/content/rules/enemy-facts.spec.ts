import { join } from 'path';
import { loadContentTree } from 'src/content/loading/content-tree';
import { ContentConfig } from 'src/content/rules/content-config';
import { enemyFactsOf } from 'src/content/rules/enemy-facts';

const FIXTURES_DIR = join(
    __dirname,
    '..',
    '..',
    '..',
    'test',
    'content-fixtures',
);

describe('enemyFactsOf', () => {
    let config: ContentConfig;

    beforeAll(() => {
        config = loadContentTree(FIXTURES_DIR).config!;
    });

    it('derives the tier from the document level (D-10)', () => {
        const facts = enemyFactsOf(
            { category: 'monster', source: { level: 4, pe: 1100, pf: 30 } },
            config,
        );

        expect(facts).toEqual({ tier: 'adventurer', level: 4, pe: 1100 });
    });

    it('derives the level from the medium column when the entry has none (D-10)', () => {
        const facts = enemyFactsOf(
            { category: 'humanoid', source: { pe: 700, pf: 40 } },
            config,
        );

        expect(facts).toEqual({ tier: 'paladin', level: 6, pe: 700 });
    });

    it('marks legendary entries as legend', () => {
        const facts = enemyFactsOf(
            { category: 'legendary', source: { level: 20, pe: 5000, pf: 300 } },
            config,
        );

        expect(facts.tier).toBe('legend');
    });

    it('keeps an explicit tier override', () => {
        const facts = enemyFactsOf(
            {
                category: 'monster',
                tier: 'mage',
                source: { level: 1, pe: 50, pf: 11 },
            },
            config,
        );

        expect(facts).toEqual({ tier: 'mage', level: 1, pe: 50 });
    });

    it('returns no tier without source nor override', () => {
        const facts = enemyFactsOf(
            { category: 'monster', xp: 63, lifePoints: 5000 },
            config,
        );

        expect(facts).toEqual({ tier: null, level: null, pe: null });
    });
});
