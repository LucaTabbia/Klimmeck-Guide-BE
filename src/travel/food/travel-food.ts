// regola del cibo di viaggio (Phase 14): 1 power ogni 3 minuti della durata del pianificatore, km scoperti per eccesso, il km scoperto n-esimo costa n HP; costanti di dominio, nessuna variabile d'ambiente (D-07)
import { MIN_LIFE_POINTS } from 'src/quests/outcomes/progression/level-table';
import { ConsumedFood, FoodStack, selectFood } from './food-selection';

// 3 minuti di marcia per power (D-01); si arriva con almeno 1 HP (D-04)
export const FOOD_RULES = {
    minutesPerPower: 3,
    minLifePoints: MIN_LIFE_POINTS,
} as const;

export interface TravelFoodInput {
    durationMs: number;
    distanceKm: number;
    hpBefore: number;
    stacks: readonly FoodStack[];
}

export interface TravelFoodPlan {
    consumed: ConsumedFood[];
    needed: number;
    covered: number;
    uncoveredKm: number;
    hpLost: number;
    hpAfter: number;
    arrivesAlive: boolean;
}

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

// piano completo della partenza (D-04): tutto o parte del cibo, il resto scoperto; si parte solo con almeno 1 HP all'arrivo
export function planTravelFood(input: TravelFoodInput): TravelFoodPlan {
    const needed = foodNeededFor(input.durationMs);
    const { consumed, covered } = selectFood(needed, input.stacks);
    const uncoveredKm = uncoveredKmOf(needed, covered, input.distanceKm);
    const hpLost = hpLostFor(uncoveredKm);
    const hpAfter = input.hpBefore - hpLost;
    return {
        consumed,
        needed,
        covered,
        uncoveredKm,
        hpLost,
        hpAfter,
        arrivesAlive: hpAfter >= FOOD_RULES.minLifePoints,
    };
}
