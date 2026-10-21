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

export function routeOf(
    _nodes: readonly string[],
    _edgeOf: (from: string, to: string) => RouteEdge | null,
    _coordOf: (node: string) => LonLat,
    _from: LonLat,
    _to: LonLat,
): RoadRoute | null {
    throw new Error('not implemented');
}
