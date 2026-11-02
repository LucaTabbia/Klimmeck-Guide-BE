import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';
import { loadContentTree } from 'src/content/loading/content-tree';
import { parseYamlFile } from 'src/content/loading/yaml-file';
import { parseContentConfig } from 'src/content/rules/content-config';

const FILE = 'config.yaml';
const FIXTURE_DIR = join(__dirname, '../../../test/content-fixtures');

type RawConfig = Record<string, Record<string, unknown>> & {
    mediumPeByLevel: unknown;
    dungeonHeroZones: unknown;
    dungeonHeroCityTypes: unknown;
};

function repositoryConfig(): RawConfig {
    const text = readFileSync(join(DEFAULT_CONTENT_DIR, FILE), 'utf8');
    return parseYamlFile(FILE, text).value as RawConfig;
}

function issuePathsOf(raw: unknown): string[] {
    return parseContentConfig(raw, FILE).issues.map(({ path }) => path);
}

describe('parseContentConfig', () => {
    it('accepts the repository config (D-19)', () => {
        const { config, issues } = parseContentConfig(repositoryConfig(), FILE);

        expect(issues).toEqual([]);
        expect(config?.enemy.xpScale).toBe(0.14084507);
        expect(config?.tierMultiplier.hero).toBe(25);
        expect(config?.prizes.dungeon).toEqual({
            copper: 400,
            xp: 80,
            randomLootQuantity: 1,
        });
        expect(config?.generator.seed).toBe(11);
        expect(config?.dungeonHeroCityTypes).toEqual(['necrorianCity']);
    });

    it('loads the config of the test content tree (D-19)', () => {
        const tree = loadContentTree(FIXTURE_DIR);

        expect(tree.issues).toEqual([]);
        expect(tree.config).toEqual(
            parseContentConfig(repositoryConfig(), FILE).config,
        );
    });

    it('rejects a missing prize type (D-19)', () => {
        const raw = repositoryConfig();
        delete raw.prizes.heal;
        delete raw.timeToCompleteHours.guard;

        const { config, issues } = parseContentConfig(raw, FILE);

        expect(config).toBeNull();
        expect(issues.map(({ path }) => path)).toEqual([
            'prizes.heal',
            'timeToCompleteHours.guard',
        ]);
        expect(issues[0]).toMatchObject({
            file: FILE,
            line: null,
            entryId: null,
        });
    });

    it.each([
        ['19 values', (table: number[]) => table.slice(1)],
        [
            'a decreasing value',
            (table: number[]) => [table[1], table[0], ...table.slice(2)],
        ],
        ['a fraction', (table: number[]) => [50.5, ...table.slice(1)]],
    ])(
        'rejects a medium table that is not 20 increasing integers (D-10): %s',
        (_case, alter) => {
            const raw = repositoryConfig();
            raw.mediumPeByLevel = alter(raw.mediumPeByLevel as number[]);

            expect(issuePathsOf(raw)).toEqual(['mediumPeByLevel']);
        },
    );

    it('rejects tiers that do not cover the levels 1..20 contiguously (D-10)', () => {
        const raw = repositoryConfig();
        raw.tiers.paladin = [6, 10];

        expect(issuePathsOf(raw)).toEqual(['tiers']);
    });

    it.each([
        ['generator.crimeCityChance', 1.5],
        ['generator.studyCityChance', -0.1],
        ['hunt.maxShareOfRegion', 2],
    ])('rejects a chance outside 0..1: %s', (path, value) => {
        const raw = repositoryConfig();
        const [section, key] = path.split('.');
        raw[section][key] = value;

        expect(issuePathsOf(raw)).toEqual([path]);
    });

    it.each([
        ['enemy.xpScale', 0],
        ['enemy.hpScale', -100],
        ['food.minutesPerPower', 'tre'],
    ])('rejects a scale that is not a positive number: %s', (path, value) => {
        const raw = repositoryConfig();
        const [section, key] = path.split('.');
        raw[section][key] = value;

        expect(issuePathsOf(raw)).toEqual([path]);
    });

    it.each([
        ['dungeonLootRarity.paladin', 'epic'],
        ['minTitle.serviceCity', 'king'],
        ['dungeonTierByCitySize.Capital', 'emperor'],
    ])('rejects an unknown rarity or tier: %s', (path, value) => {
        const raw = repositoryConfig();
        const [section, key] = path.split('.');
        raw[section][key] = value;

        expect(issuePathsOf(raw)).toEqual([path]);
    });

    it.each([
        ['minTitle.serviceCapital', 'legend'],
        ['dungeonTierByCitySize.Village', 'legend'],
    ])(
        'rejects legend where a fixed quest needs a prized tier: %s',
        (path, value) => {
            const raw = repositoryConfig();
            const [section, key] = path.split('.');
            raw[section][key] = value;

            expect(issuePathsOf(raw)).toEqual([path]);
        },
    );

    it.each([
        ['enemy', 'xpScal', 0.1, 'enemy.xpScal'],
        ['tiers', 'legend', [21, 30], 'tiers.legend'],
        ['minTitle', 'serviceVillage', 'rookie', 'minTitle.serviceVillage'],
        ['hunt', 'maxAnimalPE', 300, 'hunt.maxAnimalPE'],
        ['generator', 'sed', 3, 'generator.sed'],
        ['prizes', 'boss', { copper: 1, xp: 1 }, 'prizes.boss'],
    ])(
        'rejects an unknown key inside a section: %s.%s',
        (section, key, value, path) => {
            const raw = repositoryConfig();
            raw[section][key] = value;

            expect(parseContentConfig(raw, FILE).issues).toEqual([
                expect.objectContaining({
                    path,
                    message: 'chiave sconosciuta',
                }),
            ]);
        },
    );

    it('rejects a misspelled random loot quantity instead of defaulting it', () => {
        const raw = repositoryConfig();
        const dungeon = raw.prizes.dungeon as Record<string, unknown>;
        delete dungeon.randomLootQuantity;
        dungeon.randomLootQty = 3;

        expect(issuePathsOf(raw)).toEqual(['prizes.dungeon.randomLootQty']);
    });

    it('accepts randomLootQuantity only on the dungeon prize', () => {
        const raw = repositoryConfig();
        (raw.prizes.hunt as Record<string, unknown>).randomLootQuantity = 2;

        expect(issuePathsOf(raw)).toEqual(['prizes.hunt.randomLootQuantity']);
    });

    it('caps the quest hours below the GraphQL Int in milliseconds (Pitfall 4)', () => {
        const raw = repositoryConfig();
        raw.timeToCompleteHours.heal = 596;
        raw.timeToCompleteHours.guard = 597;

        expect(issuePathsOf(raw)).toEqual(['timeToCompleteHours.guard']);
    });

    it('rejects a hero zone that is not a point of interest type', () => {
        const raw = repositoryConfig();
        raw.dungeonHeroZones = ['glounet', 'atlantide'];

        expect(issuePathsOf(raw)).toEqual(['dungeonHeroZones[1]']);
    });

    it('rejects a hero dungeon city type that is not a CityType (D-20)', () => {
        const raw = repositoryConfig();
        raw.dungeonHeroCityTypes = ['necrorianCity', 'atlantideCity'];

        expect(issuePathsOf(raw)).toEqual(['dungeonHeroCityTypes[1]']);
    });

    it('requires the hero dungeon city types, never a silent default (D-20)', () => {
        const raw = repositoryConfig();
        delete (raw as Partial<RawConfig>).dungeonHeroCityTypes;

        expect(issuePathsOf(raw)).toEqual(['dungeonHeroCityTypes']);
    });

    it('rejects a config that is not a mapping, never a silent default', () => {
        expect(issuePathsOf(null)).toEqual(['']);
        expect(issuePathsOf([1, 2])).toEqual(['']);
    });
});
