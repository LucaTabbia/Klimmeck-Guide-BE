export type LonLat = [number, number];

export interface RouteEdge {
    lengthKm: number;
    speedFactor: number;
}

// polilinea orientata dalla partenza alla meta (D-10); km e ore contano solo gli archi, come getPath (A3)
export interface RoadRoute {
    coordinates: LonLat[];
    distanceKm: number;
    baseHours: number;
}

const PRECISION = 7;

export function routeOf(
    nodes: readonly string[],
    edgeOf: (from: string, to: string) => RouteEdge | null,
    coordOf: (node: string) => LonLat,
    from: LonLat,
    to: LonLat,
): RoadRoute | null {
    if (nodes.length < 2) return null;

    let distanceKm = 0;
    let baseHours = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
        const edge = edgeOf(nodes[i], nodes[i + 1]);
        if (!edge) return null;
        distanceKm += edge.lengthKm;
        baseHours += edge.lengthKm / edge.speedFactor;
    }

    return {
        coordinates: collapse([from, ...nodes.map(coordOf), to]),
        distanceKm,
        baseHours,
    };
}

// stessa regola di RoadsService.roundCoord: il POI non arrotondato coincide col nodo arrotondato
function round(value: number): number {
    return parseFloat(value.toFixed(PRECISION));
}

function samePoint(a: LonLat, b: LonLat): boolean {
    return round(a[0]) === round(b[0]) && round(a[1]) === round(b[1]);
}

function collapse(points: readonly LonLat[]): LonLat[] {
    const kept: LonLat[] = [];
    for (const point of points) {
        const last = kept[kept.length - 1];
        if (!last || !samePoint(last, point)) kept.push(point);
    }
    return kept;
}
