// regola del cibo di viaggio (Phase 14): 1 power ogni 3 minuti della durata del pianificatore, km scoperti per eccesso, il km scoperto n-esimo costa n HP; costanti di dominio, nessuna variabile d'ambiente (D-07)
import { MIN_LIFE_POINTS } from 'src/quests/outcomes/progression/level-table';

// 3 minuti di marcia per power (D-01); si arriva con almeno 1 HP (D-04)
export const FOOD_RULES = {
    minutesPerPower: 3,
    minLifePoints: MIN_LIFE_POINTS,
} as const;

const MS_PER_MINUTE = 60_000;
const MS_PER_POWER = FOOD_RULES.minutesPerPower * MS_PER_MINUTE;
const METRES_PER_KM = 1000;

// la durata è già quella del pianificatore: terreno, pet e ferite compresi (D-01)
export function foodNeededFor(durationMs: number): number {
    return durationMs > 0 ? Math.ceil(durationMs / MS_PER_POWER) : 0;
}

// per eccesso in metri interi, senza epsilon (D-03, D-07 emendato): la distanza è arrotondata al metro; coperto ⇒ 0 km
export function uncoveredKmOf(
    needed: number,
    covered: number,
    distanceKm: number,
): number {
    if (needed <= covered) return 0;
    const metres = Math.round(distanceKm * METRES_PER_KM);
    return Math.ceil(((needed - covered) * metres) / (needed * METRES_PER_KM));
}

// triangolare: il km scoperto n-esimo costa n HP (D-02)
export function hpLostFor(uncoveredKm: number): number {
    return (uncoveredKm * (uncoveredKm + 1)) / 2;
}
