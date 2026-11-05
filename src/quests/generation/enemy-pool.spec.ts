import {
    EnemyCandidate,
    fallbackPoolOf,
    zonePoolOf,
} from 'src/quests/generation/enemy-pool';

const candidate = (
    id: string,
    locations: readonly string[],
    overrides: Partial<EnemyCandidate> = {},
): EnemyCandidate => ({
    id,
    name: `Nemico ${id}`,
    xp: 20,
    locations,
    legendary: false,
    relatedLore: [],
    baseWeaknesses: [],
    energyWeaknesses: [],
    ...overrides,
});

const idsOf = (pool: readonly EnemyCandidate[]): string[] =>
    pool.map((enemy) => enemy.id);

const catalog: EnemyCandidate[] = [
    candidate('e5', ['all']),
    candidate('e4', ['desert']),
    candidate('e3', ['city']),
    candidate('e2', ['dungeon']),
    candidate('e1', ['forest']),
];

describe('enemy pool of a point of interest', () => {
    it('pools the enemies of the poi zones plus the city habitat (D-08)', () => {
        expect(idsOf(zonePoolOf(catalog, ['forest', 'dungeon']))).toEqual([
            'e1',
            'e2',
            'e3',
        ]);
    });

    it('adds the all habitat only in the fallback pool (D-08)', () => {
        expect(idsOf(fallbackPoolOf(catalog, ['forest', 'dungeon']))).toEqual([
            'e1',
            'e2',
            'e3',
            'e5',
        ]);
    });

    it('excludes legendary enemies and enemies without the flag (D-04)', () => {
        const enemies = [
            candidate('l1', ['forest'], { legendary: true }),
            candidate('l2', ['forest'], { legendary: undefined }),
            candidate('l3', ['forest'], { legendary: null }),
            candidate('l4', ['all'], { legendary: true }),
            candidate('l5', ['forest'], { legendary: false }),
        ];

        expect(idsOf(zonePoolOf(enemies, ['forest']))).toEqual(['l5']);
        expect(idsOf(fallbackPoolOf(enemies, ['forest']))).toEqual(['l5']);
    });

    it('includes the animals of the zone (D-08)', () => {
        const wolf = candidate('a1', ['forest'], {
            name: 'Lupo',
            relatedLore: ['animali'],
        });

        expect(zonePoolOf([wolf], ['forest'])).toEqual([wolf]);
    });

    it('ignores the city type of the marker when the poi has its own zones (D-08)', () => {
        const forward = zonePoolOf(catalog, ['city', 'forest']);
        const backward = zonePoolOf(catalog, ['forest', 'city']);

        expect(idsOf(forward)).toEqual(['e1', 'e3']);
        expect(idsOf(backward)).toEqual(idsOf(forward));
    });
});
