import type { Types } from 'mongoose';
import type { TradeLine } from 'src/economy/trade/trade-line';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import type { ConsumedFood } from './food-selection';

// il cibo mangiato è una vendita senza incasso: righe usate dall'assestamento (Phase 14 D-12, Phase 20 D-03)
export function mealLinesOf(consumed: readonly ConsumedFood[]): TradeLine[] {
    return consumed.map(({ itemId, quantity }) => ({
        direction: 'sell',
        kind: 'LootItem',
        itemId,
        quantity,
    }));
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
