import { TitleType } from 'src/models/enums/title-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    budgetOf,
    GeneratedRank,
    RANK_XP_BANDS,
} from 'src/quests/generation/generation-rules';
import { keyedChance } from 'src/quests/generation/seeded-chance';
import {
    DUNGEON_STAGES,
    DUNGEON_STAGES_SEED,
    DungeonStage,
    dungeonStagesOf,
    dungeonTitleOf,
    isCoherentDungeon,
} from './dungeon-stages';

const FOREST = ['forest'];
const KEYS = Array.from(
    { length: 50 },
    (_, index) => `6ae80bf6947d6a4235d${index.toString(16).padStart(5, '0')}`,
);
const RANKS: readonly GeneratedRank[] = [
    TitleType.rookie,
    TitleType.adventurer,
    TitleType.paladin,
    TitleType.mage,
    TitleType.hero,
];

let counter = 0;
function candidate(
    name: string,
    xp: number,
    locations: readonly string[],
    overrides: Partial<EnemyCandidate> = {},
): EnemyCandidate {
    counter += 1;
    return {
        id: `6ae80bf6947d6a4235210${counter.toString(16).padStart(3, '0')}`,
        name,
        xp,
        locations,
        legendary: false,
        relatedLore: [],
        baseWeaknesses: [],
        energyWeaknesses: [],
        animal: false,
        ...overrides,
    };
}

// foresta + city: abbastanza deboli e forti per comporre 2–4 tappe in ogni rango
const ZONE_ENEMIES: EnemyCandidate[] = [
    candidate('Ratto', 2, ['forest']),
    candidate('Bandito', 4, ['forest']),
    candidate('Lupo mannaro', 10, ['forest']),
    candidate('Guardia corrotta', 18, ['city']),
    candidate('Orso', 28, ['forest']),
    candidate('Capo dei Banditi', 45, ['forest']),
    candidate('Orsogufo', 69, ['forest']),
    candidate('Ogre', 90, ['forest']),
    candidate('Troll', 150, ['forest']),
    candidate('Gigante', 300, ['forest']),
    candidate('Mago rinnegato', 450, ['forest']),
    candidate('Gladiatore', 560, ['forest']),
    candidate('Cavaliere nero', 700, ['forest']),
];
const [, BANDIT, , , BEAR, , OWLBEAR] = ZONE_ENEMIES;
const ANYWHERE_ENEMIES: EnemyCandidate[] = [
    candidate('Spettro', 3, ['all']),
    candidate('Ombra', 15, ['all']),
    candidate('Wraith', 40, ['all']),
    candidate('Banshee', 120, ['all']),
    candidate('Lich minore', 300, ['all']),
    candidate('Arcimago', 600, ['all']),
];
const DESERT_ONLY = [
    candidate('Scorpione', 12, ['desert']),
    candidate('Sfinge', 120, ['desert']),
];
// gemelli animali e leggendari di ogni nemico di zona (13.1 D-01)
const ANIMAL_TWINS = ZONE_ENEMIES.map((enemy) =>
    candidate(`${enemy.name} selvatico`, enemy.xp, enemy.locations, {
        animal: true,
    }),
);
const LEGENDARY_TWINS = ZONE_ENEMIES.map((enemy) =>
    candidate(`${enemy.name} leggendario`, enemy.xp, enemy.locations, {
        legendary: true,
    }),
);
const ANIMAL_WOLF = ANIMAL_TWINS[4];
const CATALOG = [
    ...ZONE_ENEMIES,
    ...ANYWHERE_ENEMIES,
    ...DESERT_ONLY,
    ...ANIMAL_TWINS,
    ...LEGENDARY_TWINS,
];
const BY_ID: ReadonlyMap<string, EnemyCandidate> = new Map(
    CATALOG.map((enemy) => [enemy.id, enemy]),
);

const stage = (enemy: EnemyCandidate, quantity = 1): DungeonStage => ({
    enemy: enemy.id,
    quantity,
});

const xpOf = (stages: readonly DungeonStage[]): number =>
    stages.reduce(
        (sum, entry) =>
            sum + (BY_ID.get(entry.enemy)?.xp ?? 0) * entry.quantity,
        0,
    );

function stagesFor(
    rank: GeneratedRank,
    key: string,
    options: {
        current?: readonly DungeonStage[];
        poiTypes?: readonly string[];
        enemies?: readonly EnemyCandidate[];
    } = {},
): DungeonStage[] | null {
    return dungeonStagesOf({
        rank,
        current: options.current ?? [],
        poiTypes: options.poiTypes ?? FOREST,
        enemies: options.enemies ?? CATALOG,
        chance: keyedChance(DUNGEON_STAGES_SEED, key),
    });
}

function everyStages(
    options: Parameters<typeof stagesFor>[2] = {},
): { rank: GeneratedRank; stages: DungeonStage[] | null }[] {
    return RANKS.flatMap((rank) =>
        KEYS.map((key) => ({ rank, stages: stagesFor(rank, key, options) })),
    );
}

describe('dungeon stages v2', () => {
    it('judges a dungeon coherent without animals, inside the budget and with every stage under the band (D-07)', () => {
        const adventurer = TitleType.adventurer;
        const unknown = { enemy: '6ae80bf6947d6a4235ffffff', quantity: 1 };

        expect(
            isCoherentDungeon(
                [stage(BEAR), stage(BANDIT, 3)],
                BY_ID,
                adventurer,
            ),
        ).toBe(true);
        expect(
            isCoherentDungeon(
                [stage(BEAR), stage(ANIMAL_WOLF)],
                BY_ID,
                adventurer,
            ),
        ).toBe(false);
        expect(
            isCoherentDungeon(
                [stage(BEAR), stage(LEGENDARY_TWINS[1], 3)],
                BY_ID,
                adventurer,
            ),
        ).toBe(false);
        expect(
            isCoherentDungeon([stage(BEAR), unknown], BY_ID, adventurer),
        ).toBe(false);
        expect(
            isCoherentDungeon(
                [stage(BEAR), stage(BANDIT, 11)],
                BY_ID,
                adventurer,
            ),
        ).toBe(false);
        expect(
            isCoherentDungeon(
                [stage(BANDIT), stage(BANDIT, 4)],
                BY_ID,
                adventurer,
            ),
        ).toBe(false);
    });

    it('judges a dungeon outside two to four stages incoherent (D-07)', () => {
        const adventurer = TitleType.adventurer;

        expect(isCoherentDungeon([stage(BEAR)], BY_ID, adventurer)).toBe(false);
        expect(isCoherentDungeon([], BY_ID, adventurer)).toBe(false);
        expect(
            isCoherentDungeon(
                [
                    stage(BANDIT),
                    stage(BANDIT),
                    stage(BANDIT),
                    stage(BANDIT),
                    stage(BANDIT),
                ],
                BY_ID,
                adventurer,
            ),
        ).toBe(false);
    });

    it('recomposes two to four stages inside the budget of the minTitle (D-07)', () => {
        for (const { rank, stages } of everyStages()) {
            expect(stages).not.toBeNull();
            const composed = stages ?? [];
            const budget = budgetOf(rank, 1);
            expect(composed.length).toBeGreaterThanOrEqual(DUNGEON_STAGES.min);
            expect(composed.length).toBeLessThanOrEqual(DUNGEON_STAGES.max);
            expect(xpOf(composed)).toBeGreaterThanOrEqual(budget.min);
            expect(xpOf(composed)).toBeLessThanOrEqual(budget.max);
            for (const entry of composed) {
                expect(
                    (BY_ID.get(entry.enemy)?.xp ?? 0) * entry.quantity,
                ).toBeLessThanOrEqual(RANK_XP_BANDS[rank].max);
            }
            expect(isCoherentDungeon(composed, BY_ID, rank)).toBe(true);
        }
    });

    it('never puts an animal or a legendary enemy in a stage (D-07)', () => {
        const forbidden = new Set(
            [...ANIMAL_TWINS, ...LEGENDARY_TWINS].map((enemy) => enemy.id),
        );

        const drawn = everyStages().flatMap(({ stages }) =>
            (stages ?? []).map((entry) => entry.enemy),
        );

        expect(drawn.length).toBeGreaterThan(0);
        expect(drawn.filter((id) => forbidden.has(id))).toEqual([]);
    });

    it('keeps the first enemy when it fits and replaces it otherwise (D-07)', () => {
        const adventurer = TitleType.adventurer;
        for (const key of KEYS) {
            const kept = stagesFor(adventurer, key, {
                current: [stage(BEAR), stage(ANIMAL_WOLF)],
            });
            const fromAnimal = stagesFor(adventurer, key, {
                current: [stage(ANIMAL_WOLF), stage(BEAR)],
            });
            const full = stagesFor(adventurer, key, {
                current: [stage(OWLBEAR), stage(BANDIT)],
            });

            expect(kept?.[0]).toEqual(stage(BEAR));
            expect(fromAnimal?.[0]?.enemy).not.toBe(ANIMAL_WOLF.id);
            expect(full?.[0]?.enemy).not.toBe(OWLBEAR.id);
        }
    });

    it('draws from the poi zone and falls back to the all habitat (D-07)', () => {
        const forestOrCity = new Set(ZONE_ENEMIES.map((enemy) => enemy.id));
        const anywhere = new Set(ANYWHERE_ENEMIES.map((enemy) => enemy.id));

        const fromForest = everyStages().flatMap(({ stages }) =>
            (stages ?? []).map((entry) => entry.enemy),
        );
        const fromMountain = everyStages({
            poiTypes: ['mountain'],
            enemies: [...ANYWHERE_ENEMIES, ...DESERT_ONLY],
        });

        expect(fromForest.filter((id) => !forestOrCity.has(id))).toEqual([]);
        for (const { stages } of fromMountain) {
            expect(stages).not.toBeNull();
            expect(
                (stages ?? []).filter((entry) => !anywhere.has(entry.enemy)),
            ).toEqual([]);
        }
    });

    it('returns null when no stage fits the budget (D-07)', () => {
        const weakOnly = [candidate('Topo', 2, ['forest'])];

        expect(stagesFor(TitleType.adventurer, KEYS[0], { enemies: [] })).toBe(
            null,
        );
        expect(
            stagesFor(TitleType.hero, KEYS[0], { enemies: weakOnly }),
        ).toBeNull();
    });

    it('repeats the same stages for the same dungeon id (D-07)', () => {
        for (const rank of RANKS) {
            expect(stagesFor(rank, KEYS[7])).toEqual(stagesFor(rank, KEYS[7]));
        }
    });

    it('titles a dungeon after its first enemy and its city (D-07)', () => {
        expect(dungeonTitleOf('Troll', 'Bosa')).toBe(
            'Dungeon: Troll presso Bosa',
        );
    });
});
