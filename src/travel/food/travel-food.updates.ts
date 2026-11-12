import type { Types } from 'mongoose';
import {
    applyTradeToInventory,
    type InventorySnapshot,
    soldQuantityGuards,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
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

// selezione dello sweep della fame per presenza del piano: limiti d'indice stretti, i viaggi legacy non matchano (Phase 20 D-11, D-15)
export function foodTravellersFilter(): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        'status.activeTravel.food.settledKm': { $gte: 0 },
    };
}

// l'istante di partenza è l'identità del viaggio: un viaggio nuovo non eredita l'assestamento del vecchio (D-14)
export function foodTravellerFilter(
    characterId: Types.ObjectId,
    startTime: Date,
): Record<string, unknown> {
    return {
        ...activeCharacterById(characterId),
        'status.activeTravel.startTime': startTime,
    };
}

// solo i campi del chilometro raggiunto e del piano (D-15)
export const FOOD_TRAVELLER_PROJECTION = {
    'status.activeTravel.startTime': 1,
    'status.activeTravel.duration': 1,
    'status.activeTravel.road.distance': 1,
    'status.activeTravel.ambush.km': 1,
    'status.activeTravel.food': 1,
} as const;
