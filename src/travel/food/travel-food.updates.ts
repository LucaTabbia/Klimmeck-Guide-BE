import {
    applyTradeToInventory,
    type InventorySnapshot,
    soldQuantityGuards,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import type { ConsumedFood } from './food-selection';
import type { TravelFoodPlan } from './travel-food';

// il cibo mangiato è una vendita senza incasso: guardie e inventario sono quelli del negozio (Phase 4, D-12)
export function mealLinesOf(consumed: readonly ConsumedFood[]): TradeLine[] {
    return consumed.map(({ itemId, quantity }) => ({
        direction: 'sell',
        kind: 'LootItem',
        itemId,
        quantity,
    }));
}

// rete di sicurezza nel filtro (D-12): la contesa la risolve la transazione; gli HP solo se scendono, null = legacy senza campo
export function mealGuardsOf(
    plan: TravelFoodPlan,
    hpRaw: number | null | undefined,
): Record<string, unknown> {
    const life =
        plan.hpLost > 0 ? [{ 'status.currentLifePoints': hpRaw ?? null }] : [];
    return soldQuantityGuards(mealLinesOf(plan.consumed), life);
}

// il costo nello stesso set della partenza (D-12): niente cibo ⇒ nessun inventario, niente vita persa ⇒ nessun HP
export function mealSetOf(
    plan: TravelFoodPlan,
    assets: InventorySnapshot,
): Record<string, unknown> {
    return {
        ...(plan.consumed.length > 0
            ? {
                  'assets.ownedItems': applyTradeToInventory(
                      assets,
                      mealLinesOf(plan.consumed),
                  ).ownedItems,
              }
            : {}),
        ...(plan.hpLost > 0
            ? { 'status.currentLifePoints': plan.hpAfter }
            : {}),
    };
}
