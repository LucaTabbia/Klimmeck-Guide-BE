// bordi della deviazione (C7): vertici della polilinea come nodi di partenza, poi la strada residua verso la meta
import { collapsePoints, type LonLat } from 'src/roads/road-route';
import type {
    AmbushCity,
    AmbushTravelSnapshot,
    DetourDraft,
} from './ambush-plan';

export function detourFallbacksOf(
    coordinates: readonly LonLat[],
    segment: number,
): LonLat[] {
    const indexes = [...new Set([segment, segment - 1])].filter(
        (index) => index >= 0 && index < coordinates.length,
    );
    return indexes.map((index) => coordinates[index]);
}

// D-25: senza città raggiungibile la pedina prosegue verso la meta con l'endTime di prima
export function residualDetourOf(input: {
    travel: AmbushTravelSnapshot;
    point: LonLat;
    segment: number;
    reachedCity: AmbushCity;
    petSpeed: number;
}): DetourDraft {
    const { travel, point, segment } = input;
    return {
        road: {
            coordinates: collapsePoints([
                point,
                ...travel.road.coordinates.slice(Math.max(segment, 1)),
            ]),
            distance: Math.max(0, travel.road.distance - travel.ambush.km),
        },
        to: travel.to,
        reachedCity: input.reachedCity,
        baseHours: null,
        residualMs: Math.max(
            0,
            travel.endTime.getTime() - travel.ambush.at.getTime(),
        ),
        petSpeed: input.petSpeed,
    };
}
