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
    weaknesses: { base: [], energy: [] },
    animal: false,
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

    it('excludes the animals of the zone and of the fallback pool (D-01)', () => {
        const wolf = candidate('a1', ['forest'], {
            name: 'Lupo',
            relatedLore: ['animali'],
            animal: true,
        });
        const bear = candidate('a2', ['all'], {
            name: 'Orso',
            relatedLore: ['animali'],
            animal: true,
        });
        const bandit = candidate('a3', ['forest'], {
            name: 'Bandito',
            relatedLore: ['l1'],
            animal: false,
        });
        const enemies = [wolf, bear, bandit];

        expect(zonePoolOf(enemies, ['forest'])).toEqual([bandit]);
        expect(fallbackPoolOf(enemies, ['forest'])).toEqual([bandit]);
    });

    it('ignores the city type of the marker when the poi has its own zones (D-08)', () => {
        const forward = zonePoolOf(catalog, ['city', 'forest']);
        const backward = zonePoolOf(catalog, ['forest', 'city']);

        expect(idsOf(forward)).toEqual(['e1', 'e3']);
        expect(idsOf(backward)).toEqual(idsOf(forward));
    });

    it('includes the animals of the zone when asked (D-07, D-22)', () => {
        const wolf = candidate('w', ['forest'], { animal: true });
        const enemies = [...catalog, wolf];

        expect(
            idsOf(zonePoolOf(enemies, ['forest'], { animals: 'included' })),
        ).toEqual(['e1', 'e3', 'w']);
        expect(
            idsOf(fallbackPoolOf(enemies, ['forest'], { animals: 'included' })),
        ).toEqual(['e1', 'e3', 'e5', 'w']);
    });

    it('still excludes the animals from generated quests by default (D-22)', () => {
        const wolf = candidate('w', ['forest'], { animal: true });
        const enemies = [...catalog, wolf];

        expect(idsOf(zonePoolOf(enemies, ['forest']))).toEqual(['e1', 'e3']);
        expect(idsOf(fallbackPoolOf(enemies, ['forest']))).toEqual([
            'e1',
            'e3',
            'e5',
        ]);
    });

    it('never includes legendary enemies, animals or not (D-07)', () => {
        const legend = candidate('l', ['forest'], {
            legendary: true,
            animal: true,
        });
        const enemies = [...catalog, legend];

        for (const options of [
            { animals: 'included' as const },
            { animals: 'excluded' as const },
        ]) {
            expect(idsOf(zonePoolOf(enemies, ['forest'], options))).toEqual([
                'e1',
                'e3',
            ]);
            expect(idsOf(fallbackPoolOf(enemies, ['forest'], options))).toEqual(
                ['e1', 'e3', 'e5'],
            );
        }
    });
});
