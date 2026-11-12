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

// piano salvato su activeTravel.food (Phase 20 D-05, D-13): uncoveredKm intero della Phase 14, coveredKm confine del pasto
export interface ActiveTravelFoodDraft {
    needed: number;
    uncoveredKm: number;
    coveredKm: number;
    hpLostTotal: number;
    settledKm: number;
    foodConsumedAt: Date | null;
}

export interface TravelFoodCurve {
    distanceKm: number;
    uncoveredKm: number;
    hpLostTotal: number;
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

// cibo prima, fame in coda (Phase 20 D-02, D-13): mai negativo quando l'arrotondamento supera la distanza
export function coveredKmOf(
    curve: Pick<TravelFoodCurve, 'distanceKm' | 'uncoveredKm'>,
): number {
    return Math.max(0, curve.distanceKm - curve.uncoveredKm);
}

// fame cumulata fino al km: scoperti gli ultimi, il km n-esimo si paga completato (Phase 20 D-02, D-13)
export function travelHungerAt(curve: TravelFoodCurve, km: number): number {
    if (km >= curve.distanceKm) return curve.hpLostTotal;
    const remainingMetres =
        Math.round(curve.distanceKm * METRES_PER_KM) -
        Math.round(Math.max(0, km) * METRES_PER_KM);
    const completed = Math.min(
        curve.uncoveredKm,
        Math.max(
            0,
            curve.uncoveredKm - Math.ceil(remainingMetres / METRES_PER_KM),
        ),
    );
    return hpLostFor(completed);
}

// incremento fra due km, mai negativo (Phase 20 D-08, D-16): le differenze sommano al totale della Phase 14
export function hungerBetween(
    curve: TravelFoodCurve,
    fromKm: number,
    toKm: number,
): number {
    if (toKm <= fromKm) return 0;
    return travelHungerAt(curve, toKm) - travelHungerAt(curve, fromKm);
}

// piano della partenza nei campi salvati (Phase 20 D-05, D-13): nulla assestato, nessun pasto
export function foodPlanOf(
    plan: TravelFoodPlan,
    distanceKm: number,
): ActiveTravelFoodDraft {
    return {
        needed: plan.needed,
        uncoveredKm: plan.uncoveredKm,
        coveredKm: coveredKmOf({ distanceKm, uncoveredKm: plan.uncoveredKm }),
        hpLostTotal: plan.hpLost,
        settledKm: 0,
        foodConsumedAt: null,
    };
}
