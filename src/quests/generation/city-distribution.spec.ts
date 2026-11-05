import { CitySize } from 'src/models/enums/city-size.enum';
import {
    CityNode,
    capOf,
    cityWeightOf,
    densityOf,
    neighboursOf,
    pickCity,
    pickPoi,
} from 'src/quests/generation/city-picker';
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

const GRID_COLUMNS = 6;
const GRID_ROWS = 5;
const GRID_STEP = 10;
const POIS_PER_CITY = 4;
const SIZES = [CitySize.village, CitySize.city, CitySize.capital];
const SEED = 13;

interface Simulation {
    generated: Map<string, number>;
    picks: string[];
    remainingWeight: number;
}

const gridOf = (hasFreePois: (index: number) => boolean = () => true) =>
    Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) => {
        const id = `c${String(index).padStart(2, '0')}`;
        const location: [number, number] = [
            (index % GRID_COLUMNS) * GRID_STEP,
            Math.floor(index / GRID_COLUMNS) * GRID_STEP,
        ];
        const freePoiIds = hasFreePois(index)
            ? Array.from(
                  { length: POIS_PER_CITY },
                  (__, poi) => `${id}-p${poi}`,
              )
            : [];
        return { id, location, freePoiIds, size: SIZES[index % SIZES.length] };
    });

const capsOf = (grid: readonly CityNode[]): number[] =>
    grid.map((city) => capOf(city.size));

const picksIn = (
    grid: readonly CityNode[],
    generated: ReadonlyMap<string, number>,
    size: CitySize,
): number =>
    grid
        .filter((city) => city.size === size)
        .reduce((sum, city) => sum + (generated.get(city.id) ?? 0), 0);

const weightsOf = (
    nodes: readonly CityNode[],
    neighbours: ReadonlyMap<string, readonly string[]>,
    generated: ReadonlyMap<string, number>,
): Map<string, number> =>
    new Map(
        nodes.map((city) => [
            city.id,
            cityWeightOf(
                city,
                densityOf(city.id, neighbours, generated),
                generated.get(city.id) ?? 0,
            ),
        ]),
    );

// stesso ciclo del servizio (13-13): sceglie, occupa il POI, ricalcola i pesi
function simulate(
    initial: readonly CityNode[],
    target: number,
    chance: ChanceSource,
): Simulation {
    const neighbours = neighboursOf(initial);
    let nodes = initial.map((city) => ({ ...city }));
    const generated = new Map<string, number>();
    const picks: string[] = [];
    while (picks.length < target) {
        const city = pickCity(
            nodes,
            weightsOf(nodes, neighbours, generated),
            chance,
        );
        if (city === null) break;
        const poi = pickPoi(city.freePoiIds, chance);
        nodes = nodes.map((other) =>
            other.id === city.id
                ? {
                      ...other,
                      freePoiIds: other.freePoiIds.filter((id) => id !== poi),
                  }
                : other,
        );
        generated.set(city.id, (generated.get(city.id) ?? 0) + 1);
        picks.push(`${city.id}:${poi}`);
    }
    const remainingWeight = [
        ...weightsOf(nodes, neighbours, generated).values(),
    ].reduce((sum, weight) => sum + weight, 0);
    return { generated, picks, remainingWeight };
}

describe('city distribution', () => {
    it('spreads the quests by size without exceeding any cap (D-04)', () => {
        const grid = gridOf();
        const { generated, picks } = simulate(
            grid,
            30,
            new SeededChanceSource(SEED),
        );
        const counts = grid.map((city) => generated.get(city.id) ?? 0);
        const caps = capsOf(grid);

        expect(picks).toHaveLength(30);
        expect(new Set(picks).size).toBe(30);
        expect(counts.filter((count, index) => count > caps[index])).toEqual(
            [],
        );
        expect(counts.filter((count) => count === 0).length).toBeGreaterThan(0);
        expect(picksIn(grid, generated, CitySize.capital)).toBeGreaterThan(
            picksIn(grid, generated, CitySize.village),
        );
    });

    it('fills every city up to its size cap when the target allows it (D-04)', () => {
        const grid = gridOf();
        const { generated, picks, remainingWeight } = simulate(
            grid,
            70,
            new SeededChanceSource(SEED),
        );

        expect(picks).toHaveLength(70);
        expect(grid.map((city) => generated.get(city.id) ?? 0)).toEqual(
            capsOf(grid),
        );
        expect(remainingWeight).toBe(0);
    });

    it('never picks a city without a free poi (D-04)', () => {
        const grid = gridOf((index) => index % 2 === 0);
        const empty = grid
            .filter((city) => city.freePoiIds.length === 0)
            .map((city) => city.id);
        const { generated, picks } = simulate(
            grid,
            90,
            new SeededChanceSource(SEED),
        );

        expect(empty).toHaveLength(15);
        expect(empty.filter((id) => generated.has(id))).toEqual([]);
        expect(picks).toHaveLength(5 * 1 + 5 * 2 + 5 * 4);
    });

    it('repeats the same distribution for the same seed (D-17)', () => {
        const first = simulate(gridOf(), 30, new SeededChanceSource(SEED));
        const second = simulate(gridOf(), 30, new SeededChanceSource(SEED));

        expect(second.picks).toEqual(first.picks);
    });
});
