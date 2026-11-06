// stesso algoritmo di TravelRoute.pointAt del FE (C1): lunghezze in gradi piani, nessuna haversine; frazione = km / distance = (at − startTime) / duration
import { gameDistanceKm } from 'src/roads/game-distance';
import { compareIds, LonLat } from 'src/roads/road-route';

export interface PointOnRoute {
    point: LonLat;
    // indice del vertice di fine del tratto (1-based come il FE), 0 per una polilinea di un punto
    segment: number;
}

const planar = ([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number =>
    Math.hypot(lon2 - lon1, lat2 - lat1);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function cumulativeOf(coordinates: readonly LonLat[]): number[] {
    const cumulative = [0];
    for (let i = 1; i < coordinates.length; i++) {
        cumulative.push(
            cumulative[i - 1] + planar(coordinates[i - 1], coordinates[i]),
        );
    }
    return cumulative;
}

function segmentAt(cumulative: readonly number[], target: number): number {
    for (let i = 1; i < cumulative.length; i++) {
        if (cumulative[i] >= target) return i;
    }
    return cumulative.length - 1;
}

// un tratto di lunghezza zero risponde col suo estremo iniziale (il FE darebbe NaN)
function lerp(a: LonLat, b: LonLat, t: number): LonLat {
    if (!(t > 0)) return [a[0], a[1]];
    if (t >= 1) return [b[0], b[1]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function pointAtFraction(
    coordinates: readonly LonLat[],
    fraction: number,
): PointOnRoute {
    if (coordinates.length === 0) return { point: [0, 0], segment: 0 };
    const [first] = coordinates;
    if (coordinates.length === 1) {
        return { point: [first[0], first[1]], segment: 0 };
    }
    const cumulative = cumulativeOf(coordinates);
    const total = cumulative[cumulative.length - 1];
    if (total === 0) return { point: [first[0], first[1]], segment: 1 };

    const target = clamp01(fraction) * total;
    const segment = segmentAt(cumulative, target);
    const t =
        (target - cumulative[segment - 1]) /
        (cumulative[segment] - cumulative[segment - 1]);
    return {
        point: lerp(coordinates[segment - 1], coordinates[segment], t),
        segment,
    };
}

// D-06: vince la distanza di gioco minore, a parità esatta l'id minore
export function nearestPoi<T extends { id: string; location: LonLat }>(
    point: LonLat,
    pois: readonly T[],
): T | null {
    let nearest: T | null = null;
    let nearestKm = Infinity;
    for (const poi of pois) {
        const km = gameDistanceKm(point, poi.location);
        const closer =
            km < nearestKm ||
            (km === nearestKm &&
                nearest !== null &&
                compareIds(poi.id, nearest.id) < 0);
        if (closer) {
            nearest = poi;
            nearestKm = km;
        }
    }
    return nearest;
}
