import { EnemyEntry } from 'src/content/schema/enemy.content';
import { validateEntry } from 'src/content/schema/validate-entry';

type Raw = Record<string, unknown>;

const WOLF: Raw = {
    id: '64b000000000000000000101',
    name: 'Lupo di Prova',
    category: 'animal',
    source: { level: 1, pe: 50, pf: 11, damagePerRound: { pierce: 7 } },
    locations: ['forest'],
    energyWeaknesses: [],
    baseWeaknesses: [],
    relatedLore: ['64b0000000000000000000a3'],
    spells: [],
    imagePath: 'assets/images/lupo-di-prova.png',
};

const OVERRIDES: Raw = {
    xp: 63,
    lifePoints: 5000,
    damages: { base: [{ type: 'blunt', power: 1000 }], energy: [] },
};

function withoutSource(): Raw {
    return Object.fromEntries(
        Object.entries(WOLF).filter(([key]) => key !== 'source'),
    );
}

function issuesOf(raw: Raw): string[] {
    return validateEntry(EnemyEntry, {
        file: 'enemies/esempio.yaml',
        line: 1,
        raw,
    }).map(({ message }) => message);
}

function pathsOf(raw: Raw): string[] {
    return validateEntry(EnemyEntry, {
        file: 'enemies/esempio.yaml',
        line: 1,
        raw,
    }).map(({ path }) => path);
}

describe('enemy entries', () => {
    it.each<[string, Raw]>([
        ['with a source block and no override (D-11)', WOLF],
        [
            'with explicit overrides and no source (D-11)',
            { ...withoutSource(), ...OVERRIDES },
        ],
        ['with an explicit legend tier (D-10)', { ...WOLF, tier: 'legend' }],
        [
            'with a scaled analog for a missing stat block (D-11)',
            {
                ...WOLF,
                source: {
                    pe: 70,
                    pf: 13,
                    damagePerRound: { fire: 3.5, cut: 2 },
                    analog: { name: 'Lupo', pe: 50, factor: 1.18 },
                },
            },
        ],
    ])('accepts an enemy %s', (_, raw) => {
        expect(pathsOf(raw)).toEqual([]);
    });

    it('requires a source block or the explicit xp, lifePoints and damages (D-11)', () => {
        expect(issuesOf({ ...withoutSource(), xp: 63 })).toEqual([
            expect.stringContaining(
                'source o xp/lifePoints/damages obbligatori',
            ),
        ]);
    });

    it.each<[string, Raw, string]>([
        [
            'a category outside the four kinds (D-13)',
            { ...WOLF, category: 'dragon' },
            'category',
        ],
        [
            'an enemy with no location (D-13)',
            { ...WOLF, locations: [] },
            'locations',
        ],
        [
            'a location outside PoiType (D-13)',
            { ...WOLF, locations: ['sky'] },
            'locations',
        ],
        [
            'an enhancing weakness (D-12)',
            { ...WOLF, energyWeaknesses: ['enhancing'] },
            'energyWeaknesses',
        ],
        [
            'a base weakness outside DamageType (D-12)',
            { ...WOLF, baseWeaknesses: ['fire'] },
            'baseWeaknesses',
        ],
        [
            'a damage type outside the enums (D-12)',
            {
                ...WOLF,
                source: { pe: 50, pf: 11, damagePerRound: { fuoco: 3 } },
            },
            'source.damagePerRound',
        ],
        [
            'an enhancing damage per round (D-12)',
            {
                ...WOLF,
                source: { pe: 50, pf: 11, damagePerRound: { enhancing: 3 } },
            },
            'source.damagePerRound',
        ],
        [
            'a zero damage per round (D-12)',
            {
                ...WOLF,
                source: { pe: 50, pf: 11, damagePerRound: { pierce: 0 } },
            },
            'source.damagePerRound',
        ],
        [
            'a source without experience points (D-11)',
            { ...WOLF, source: { pe: 0, pf: 11, damagePerRound: {} } },
            'source.pe',
        ],
        [
            'a source level above the document levels (D-10)',
            {
                ...WOLF,
                source: { level: 21, pe: 50, pf: 11, damagePerRound: {} },
            },
            'source.level',
        ],
        [
            'an unknown key inside the source',
            { ...WOLF, source: { pe: 50, pf: 11, damagePerRound: {}, cr: 1 } },
            'source.cr',
        ],
        ['a tier outside TitleType', { ...WOLF, tier: 'boss' }, 'tier'],
        ['an empty image path', { ...WOLF, imagePath: '' }, 'imagePath'],
        ['a zero xp override (D-11)', { ...WOLF, xp: 0 }, 'xp'],
    ])('rejects %s', (_, raw, path) => {
        expect(pathsOf(raw)).toEqual([path]);
    });
});
