import { CitySize } from 'src/models/enums/city-size.enum';
import {
    CityNode,
    GENERATED_CAP_BY_SIZE,
    NEIGHBOUR_COUNT,
    SIZE_WEIGHT_BY_SIZE,
    capOf,
    cityWeightOf,
    densityOf,
    freePoisOf,
    neighboursOf,
    pickCity,
    pickPoi,
    sizeWeightOf,
} from 'src/quests/generation/city-picker';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const node = (
    id: string,
    x: number,
    y = 0,
    freePoiIds: readonly string[] = ['p1'],
    size: CitySize = CitySize.city,
): CityNode => ({ id, location: [x, y], freePoiIds, size });

describe('city picker', () => {
    it('finds the five nearest markers with ties broken by id (D-29)', () => {
        const ids = ['g', 'f', 'e', 'd', 'c', 'b', 'a'];
        const nodes = ids.map((id, x) => node(id, x));

        const neighbours = neighboursOf(nodes);

        expect(NEIGHBOUR_COUNT).toBe(5);
        expect(neighbours.get('d')).toEqual(['c', 'e', 'b', 'f', 'a']);
        expect(neighbours.get('g')).toEqual(['f', 'e', 'd', 'c', 'b']);
        expect([...neighbours.keys()].sort()).toEqual([...ids].sort());
    });

    it('keeps fewer neighbours when the map has fewer cities (D-29)', () => {
        const neighbours = neighboursOf([node('a', 0), node('b', 3)]);

        expect(neighbours.get('a')).toEqual(['b']);
        expect(neighbours.get('b')).toEqual(['a']);
    });

    it('sums the generated quests of the city and of its neighbours (D-29)', () => {
        const neighbours = new Map([
            ['a', ['b', 'c']],
            ['b', ['a']],
        ]);
        const generated = new Map([
            ['a', 1],
            ['b', 2],
            ['z', 3],
        ]);

        expect(densityOf('a', neighbours, generated)).toBe(3);
        expect(densityOf('b', neighbours, generated)).toBe(3);
        expect(densityOf('c', neighbours, generated)).toBe(0);
    });

    it('weighs a city by its size factor over one plus the density squared (D-04)', () => {
        const village = node('v', 0, 0, ['p1'], CitySize.village);
        const city = node('c', 0);
        const capital = node('k', 0, 0, ['p1'], CitySize.capital);

        expect(cityWeightOf(village, 0, 0)).toBe(1);
        expect(cityWeightOf(city, 0, 0)).toBe(2);
        expect(cityWeightOf(capital, 0, 0)).toBe(4);
        expect(cityWeightOf(capital, 1, 1)).toBe(1);
        expect(cityWeightOf(city, 3, 1)).toBe(0.125);
    });

    it('caps the generated quests at one per village, two per city and four per capital (D-04)', () => {
        const village = node('v', 0, 0, ['p1'], CitySize.village);
        const city = node('c', 0);
        const capital = node('k', 0, 0, ['p1'], CitySize.capital);
        const emptyCapital = node('e', 0, 0, [], CitySize.capital);

        expect(cityWeightOf(village, 0, 1)).toBe(0);
        expect(cityWeightOf(city, 0, 1)).toBeGreaterThan(0);
        expect(cityWeightOf(city, 0, 2)).toBe(0);
        expect(cityWeightOf(capital, 0, 3)).toBeGreaterThan(0);
        expect(cityWeightOf(capital, 0, 4)).toBe(0);
        expect(cityWeightOf(emptyCapital, 0, 0)).toBe(0);
    });

    it('pins the caps and the size factors (D-04)', () => {
        const bySize = { village: 1, city: 2, capital: 4 };

        expect(GENERATED_CAP_BY_SIZE).toEqual(bySize);
        expect(SIZE_WEIGHT_BY_SIZE).toEqual(bySize);
        expect(capOf(CitySize.capital)).toBe(4);
        expect(sizeWeightOf(CitySize.village)).toBe(1);
    });

    it('excludes the city marker and every poi with an open quest (D-15)', () => {
        const free = freePoisOf(
            { markerLocation: 'm', pointsOfInterest: ['m', 'c', 'b', 'a'] },
            new Set(['b']),
        );

        expect(free).toEqual(['a', 'c']);
    });

    it('picks a city by cumulative weight in id order and none when every weight is zero (D-15)', () => {
        const nodes = [node('b', 1), node('a', 0)];
        const weights = new Map([
            ['a', 1],
            ['b', 3],
        ]);

        expect(pickCity(nodes, weights, new SequenceChance([0.2]))?.id).toBe(
            'a',
        );
        expect(pickCity(nodes, weights, new SequenceChance([0.3]))?.id).toBe(
            'b',
        );
        expect(
            pickCity(
                nodes,
                new Map([
                    ['a', 0],
                    ['b', 0],
                ]),
                new SequenceChance([0.5]),
            ),
        ).toBeNull();
    });

    it('never picks a city whose weight is zero even on the last roll (D-15)', () => {
        const nodes = [node('a', 0), node('b', 1)];
        const weights = new Map([
            ['a', 1],
            ['b', 0],
        ]);

        expect(
            pickCity(nodes, weights, new SequenceChance([0.999999]))?.id,
        ).toBe('a');
    });

    it('picks a free poi uniformly (D-15)', () => {
        const pois = ['p1', 'p2', 'p3'];

        expect(pickPoi(pois, new SequenceChance([0.0]))).toBe('p1');
        expect(pickPoi(pois, new SequenceChance([0.5]))).toBe('p2');
        expect(pickPoi(pois, new SequenceChance([0.99]))).toBe('p3');
    });
});
