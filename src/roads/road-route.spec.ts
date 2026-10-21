import { LonLat, RouteEdge, routeOf } from './road-route';

const COORDS: Record<string, LonLat> = {
    a: [0, 0],
    b: [0, 0.1],
    c: [0, 0.2],
};

const EDGES: Record<string, RouteEdge> = {
    'a-b': { lengthKm: 1, speedFactor: 5 },
    'b-c': { lengthKm: 2, speedFactor: 4 },
};

const coordOf = (node: string): LonLat => COORDS[node];

const edgeOf = (from: string, to: string): RouteEdge | null =>
    EDGES[`${from}-${to}`] ?? EDGES[`${to}-${from}`] ?? null;

describe('routeOf', () => {
    it('follows the nodes without duplicating endpoints that are already nodes', () => {
        const route = routeOf(
            ['a', 'b', 'c'],
            edgeOf,
            coordOf,
            [0, 0],
            [0, 0.2],
        );

        expect(route).not.toBeNull();
        expect(route!.coordinates).toEqual([
            [0, 0],
            [0, 0.1],
            [0, 0.2],
        ]);
        expect(route!.distanceKm).toBe(3);
        expect(route!.baseHours).toBeCloseTo(1 / 5 + 2 / 4, 12);
    });

    it('takes its orientation from the node order', () => {
        const route = routeOf(
            ['c', 'b', 'a'],
            edgeOf,
            coordOf,
            [0, 0.2],
            [0, 0],
        );

        expect(route!.coordinates).toEqual([
            [0, 0.2],
            [0, 0.1],
            [0, 0],
        ]);
        expect(route!.distanceKm).toBe(3);
        expect(route!.baseHours).toBeCloseTo(1 / 5 + 2 / 4, 12);
    });

    it('keeps off-node endpoints in the polyline but not in the sums', () => {
        const route = routeOf(
            ['a', 'b', 'c'],
            edgeOf,
            coordOf,
            [0.01, 0],
            [0, 0.21],
        );

        expect(route!.coordinates).toEqual([
            [0.01, 0],
            [0, 0],
            [0, 0.1],
            [0, 0.2],
            [0, 0.21],
        ]);
        expect(route!.distanceKm).toBe(3);
        expect(route!.baseHours).toBeCloseTo(1 / 5 + 2 / 4, 12);
    });

    it('collapses an endpoint equal to its node after rounding to 7 decimals', () => {
        const route = routeOf(
            ['a', 'b', 'c'],
            edgeOf,
            coordOf,
            [0.00000001, 0],
            [0, 0.2],
        );

        expect(route!.coordinates).toEqual([
            [0.00000001, 0],
            [0, 0.1],
            [0, 0.2],
        ]);
    });

    it('answers null when a consecutive pair has no edge', () => {
        const route = routeOf(
            ['a', 'b', 'c'],
            (from, to) =>
                from === 'b' && to === 'c' ? null : edgeOf(from, to),
            coordOf,
            [0, 0],
            [0, 0.2],
        );

        expect(route).toBeNull();
    });

    it.each([[['a']], [[]]])(
        'answers null with fewer than two nodes (%j)',
        (nodes) => {
            expect(
                routeOf(nodes, edgeOf, coordOf, [0, 0], [0, 0.2]),
            ).toBeNull();
        },
    );
});
