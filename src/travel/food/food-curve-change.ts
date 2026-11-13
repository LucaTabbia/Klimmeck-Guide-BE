// la curva riscritta dal fail-safe del confine (Phase 20 D-19): una sola riga di log, solo id e km scoperti, per sweep e imboscata
import type { ActiveTravelFoodDraft } from './travel-food';
import type { FoodSettlement } from './travel-food-settlement';

export interface FoodCurveChange {
    before: number;
    after: number;
}

export function curveChangeOf(
    food: ActiveTravelFoodDraft,
    settlement: FoodSettlement | null,
): FoodCurveChange | null {
    if (!settlement?.curve) return null;
    return { before: food.uncoveredKm, after: settlement.curve.uncoveredKm };
}

export function curveChangeMessageOf(
    characterId: string,
    change: FoodCurveChange,
): string {
    return `Viaggio del personaggio ${characterId}: cibo cambiato al confine, km scoperti ${change.before} → ${change.after}`;
}
