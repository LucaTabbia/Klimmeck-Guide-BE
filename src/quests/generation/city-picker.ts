import { ChanceSource } from 'src/quests/outcomes/chance-source';

// k vicini sui marker (D-29): i gruppi del CityType sono troppo disomogenei per fare da vicinato
export const NEIGHBOUR_COUNT = 5;
// tetto delle generate attive per città (D-15): le fisse e le GM non contano
export const MAX_GENERATED_PER_CITY = 3;

export interface CityNode {
    id: string;
    location: readonly [number, number];
    freePoiIds: readonly string[];
}

const squaredDistance = (
    from: readonly [number, number],
    to: readonly [number, number],
): number => (from[0] - to[0]) ** 2 + (from[1] - to[1]) ** 2;

const byId = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;

// O(n²) una volta per corsa: con ~170 città è trascurabile (T-13-12b)
export function neighboursOf(
    nodes: readonly CityNode[],
    count = NEIGHBOUR_COUNT,
): Map<string, string[]> {
    const neighbours = new Map<string, string[]>();
    for (const city of nodes) {
        const nearest = nodes
            .filter((other) => other.id !== city.id)
            .map((other) => ({
                id: other.id,
                distance: squaredDistance(city.location, other.location),
            }))
            .sort(
                (left, right) =>
                    left.distance - right.distance || byId(left.id, right.id),
            )
            .slice(0, count)
            .map((other) => other.id);
        neighbours.set(city.id, nearest);
    }
    return neighbours;
}

export function densityOf(
    cityId: string,
    neighbours: ReadonlyMap<string, readonly string[]>,
    generated: ReadonlyMap<string, number>,
): number {
    const countOf = (id: string): number => generated.get(id) ?? 0;
    return (neighbours.get(cityId) ?? []).reduce(
        (sum, id) => sum + countOf(id),
        countOf(cityId),
    );
}

export function cityWeightOf(
    node: CityNode,
    density: number,
    generated: number,
): number {
    if (generated >= MAX_GENERATED_PER_CITY) return 0;
    if (node.freePoiIds.length === 0) return 0;
    return 1 / (1 + density) ** 2;
}

export function pickCity(
    nodes: readonly CityNode[],
    weights: ReadonlyMap<string, number>,
    chance: ChanceSource,
): CityNode | null {
    const weighted = [...nodes]
        .sort((left, right) => byId(left.id, right.id))
        .map((city) => ({ city, weight: weights.get(city.id) ?? 0 }))
        .filter(({ weight }) => weight > 0);
    if (weighted.length === 0) return null;

    const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
    const roll = chance.next() * total;
    let cumulative = 0;
    for (const { city, weight } of weighted) {
        cumulative += weight;
        if (roll < cumulative) return city;
    }
    // arrotondamento della somma: l'ultimo peso positivo copre il resto
    return weighted[weighted.length - 1].city;
}

// POI libero (D-15): né il marker della città né un POI con una quest non conclusa sopra
export function freePoisOf(
    city: { markerLocation: string; pointsOfInterest: readonly string[] },
    occupied: ReadonlySet<string>,
): string[] {
    return city.pointsOfInterest
        .filter((id) => id !== city.markerLocation && !occupied.has(id))
        .sort(byId);
}

export function pickPoi(
    freePoiIds: readonly string[],
    chance: ChanceSource,
): string {
    const index = Math.min(
        freePoiIds.length - 1,
        Math.floor(chance.next() * freePoiIds.length),
    );
    return freePoiIds[index];
}
