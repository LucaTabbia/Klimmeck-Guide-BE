import { LonLat } from './road-route';

// haversine di gioco: raggio ridotto della mappa di Klimmeck, la stessa base dei km delle strade (Phase 8)
export const GAME_EARTH_RADIUS_KM = 127.42;

const toRad = (degrees: number): number => degrees * (Math.PI / 180);

export function gameDistanceKm(a: LonLat, b: LonLat): number {
    const [lon1, lat1] = a;
    const [lon2, lat2] = b;

    const latRad1 = toRad(lat1);
    const latRad2 = toRad(lat2);
    const deltaLat = toRad(lat2 - lat1);
    const deltaLon = toRad(lon2 - lon1);

    const haversine =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(latRad1) * Math.cos(latRad2) * Math.sin(deltaLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return GAME_EARTH_RADIUS_KM * c;
}
