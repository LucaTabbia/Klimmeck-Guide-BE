import {
    catalogStats,
    distributionOf,
    winChance,
} from 'src/content/analysis/catalog-stats';
import { ContentTree } from 'src/content/loading/content-tree';
import {
    addEntry,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';

const ENCOUNTER_ENEMIES: [string, string, Record<string, unknown>][] = [
    ['6ae806b55093fb43140756d9', 'Lupo', { source: { pf: 11 } }],
    ['6ae804ef033e23e10fe491d3', 'Troll', { source: { pf: 84 } }],
    ['6ae80b5b2e7351b494ecc870', 'Drago rosso adulto', { lifePoints: 25600 }],
    ['6ae80b5b2e7351b494ecc869', 'Tarrasque', { source: { pf: 676 } }],
];

function addEncounterEnemies(tree: ContentTree): void {
    for (const [id, name, stats] of ENCOUNTER_ENEMIES) {
        addEntry(tree, 'enemies', { id, name, ...structuredClone(stats) });
    }
}

function equipment(
    id: string,
    rarity: string,
    equipType: string,
    damages: Record<string, { type: string; power: number }[]>,
): Record<string, unknown> {
    return { id, name: `Pezzo ${id}`, rarity, equipType, damages };
}

describe('distributionOf', () => {
    it('takes the middle value of an odd list as the median', () => {
        expect(distributionOf([3, 1, 2])).toEqual({
            count: 3,
            min: 1,
            median: 2,
            max: 3,
        });
    });

    it('rounds the mean of the two middle values of an even list', () => {
        expect(distributionOf([4, 1, 3, 2]).median).toBe(3);
    });

    it('describes an empty list with zeros', () => {
        expect(distributionOf([])).toEqual({
            count: 0,
            min: 0,
            median: 0,
            max: 0,
        });
    });
});

describe('winChance', () => {
    it('follows the placeholder resolver with two decimals (D-12)', () => {
        expect(winChance(500, 1100)).toBe(0.31);
    });

    it('gives even odds when both sides are zero', () => {
        expect(winChance(0, 0)).toBe(0.5);
    });
});

describe('catalogStats', () => {
    it('measures the test content tree offline (D-12)', () => {
        const stats = catalogStats(loadTestContentTree());

        expect(stats.mode).toBe('stats');
        expect(stats.equipmentPowerByRarity).toEqual({
            common: { count: 1, min: 500, median: 500, max: 500 },
        });
        expect(stats.equipmentPowerByEquipType).toEqual({
            weapon: { count: 1, min: 500, median: 500, max: 500 },
        });
        expect(stats.spellPowerByUseType).toEqual({
            attack: { count: 1, min: 300, median: 300, max: 300 },
        });
        expect(stats.spellPower).toEqual({
            count: 1,
            min: 300,
            median: 300,
            max: 300,
        });
        expect(stats.lootPowerByEffect).toEqual({
            heal: { count: 1, min: 1000, median: 1000, max: 1000 },
        });
        expect(stats.hungerMarchMinutes.count).toBe(0);
        expect(stats.winChanceExamples).toEqual([]);
    });

    it('sums the base and energy damages of a piece (D-12)', () => {
        const tree = loadTestContentTree();
        addEntry(
            tree,
            'equipmentitems',
            equipment('64b0000000000000000000e9', 'rare', 'armor', {
                base: [
                    { type: 'cut', power: 200 },
                    { type: 'blunt', power: 100 },
                ],
                energy: [{ type: 'fire', power: 300 }],
            }),
        );

        const stats = catalogStats(tree);

        expect(stats.equipmentPowerByRarity.rare).toEqual({
            count: 1,
            min: 600,
            median: 600,
            max: 600,
        });
        expect(stats.equipmentPowerByEquipType.armor.median).toBe(600);
    });

    it('converts the food power into march minutes (D-16)', () => {
        const tree = loadTestContentTree();
        addEntry(tree, 'lootitems', {
            id: '64b0000000000000000000f9',
            name: 'Pane di Prova',
            rarity: 'common',
            power: 60,
            effect: 'hunger',
        });

        const stats = catalogStats(tree);

        expect(stats.hungerMarchMinutes).toEqual({
            count: 1,
            min: 180,
            median: 180,
            max: 180,
        });
        expect(stats.lootPowerByEffect.hunger.median).toBe(60);
    });

    it('rounds the march minutes like the resolver (D-16)', () => {
        const tree = loadTestContentTree();
        addEntry(tree, 'lootitems', {
            id: '64b0000000000000000000f9',
            name: 'Briciola di Prova',
            rarity: 'common',
            power: 0.5,
            effect: 'hunger',
        });

        expect(catalogStats(tree).hungerMarchMinutes.max).toBe(2);
    });

    it('reads the life points of each encounter from its enemy (D-12)', () => {
        const tree = loadTestContentTree();
        addEncounterEnemies(tree);
        (tree.entries.enemies.at(-1)!.raw.source as { pf: number }).pf = 700;

        expect(
            catalogStats(tree).winChanceExamples.map(
                ({ encounter, lifePoints }) => [encounter, lifePoints],
            ),
        ).toEqual([
            ['Lupo', 1100],
            ['Troll', 8400],
            ['Drago rosso adulto', 25600],
            ['Tarrasque', 70000],
        ]);
    });

    it('recomputes the four winChance examples from the median pieces (D-12)', () => {
        const tree = loadTestContentTree();
        addEncounterEnemies(tree);
        addEntry(
            tree,
            'equipmentitems',
            equipment('64b0000000000000000000e8', 'rare', 'armor', {
                base: [{ type: 'blunt', power: 1000 }],
                energy: [],
            }),
        );
        addEntry(
            tree,
            'equipmentitems',
            equipment('64b0000000000000000000e7', 'legendary', 'weapon', {
                base: [{ type: 'cut', power: 2000 }],
                energy: [],
            }),
        );

        const examples = catalogStats(tree).winChanceExamples;

        expect(examples).toEqual([
            {
                encounter: 'Lupo',
                lifePoints: 1100,
                party: 'rookie, 1 pezzo mediano common',
                partyPower: 500,
                winChance: 0.31,
            },
            {
                encounter: 'Troll',
                lifePoints: 8400,
                party: 'paladin, 3 pezzi mediani rare',
                partyPower: 3000,
                winChance: 0.26,
            },
            {
                encounter: 'Drago rosso adulto',
                lifePoints: 25600,
                party: 'hero, 9 pezzi mediani legendary',
                partyPower: 18000,
                winChance: 0.41,
            },
            {
                encounter: 'Tarrasque',
                lifePoints: 67600,
                party: '5 legend × 9 pezzi mediani legendary',
                partyPower: 90000,
                winChance: 0.57,
            },
        ]);
    });
});
