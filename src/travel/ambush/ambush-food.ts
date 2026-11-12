// passo «cibo» dell'imboscata (Phase 20 D-03, D-07, D-16, D-18): fame e pasto al km salvato prima del combattimento, pasto dei km percorsi per la sconfitta; puro, dallo snapshot letto in sessione
import type { InventoryEntry } from 'src/economy/trade/trade-inventory';
import { statusFactsOf } from 'src/quests/outcomes/progression/status-facts';
import type { ActiveTravelFoodDraft } from '../food/travel-food';
import {
    type FoodLeg,
    type FoodSettlement,
    foodLegOf,
    settlementOf,
} from '../food/travel-food-settlement';
import { type FoodCatalogEntry, stacksOf } from '../food/travel-pantry.reader';
import type { AmbushCharacterSnapshot } from './ambush-plan';

export interface AmbushFood {
    food: ActiveTravelFoodDraft;
    hpRaw: number | null | undefined;
    progress: FoodSettlement | null;
    defeat: FoodSettlement | null;
}

export interface AmbushFoodInput {
    snapshot: AmbushCharacterSnapshot;
    catalog: readonly FoodCatalogEntry[];
    now: Date;
}

// null = viaggio senza piano valido: legacy o deviazione (D-11)
export function ambushFoodOf(input: AmbushFoodInput): AmbushFood | null {
    const { snapshot, catalog, now } = input;
    const travel = snapshot.status.activeTravel;
    const leg = foodLegOf(travel);
    if (!leg) return null;
    // km salvato, mai dall'ora (Phase 20 D-16)
    const km = travel.ambush.km;
    const ownedItems = snapshot.assets?.ownedItems ?? [];
    const lifeNow = statusFactsOf(snapshot).currentLifePoints;
    const progress = settlementOf({
        leg,
        targetKm: km,
        moment: 'progress',
        lifeNow,
        assets: { ownedItems },
        stacks: stacksOf(ownedItems, catalog),
        now,
    });
    const pantry = pantryAfter(ownedItems, progress);
    const defeat = settlementOf({
        leg: legAfterProgress(leg, km, progress),
        targetKm: km,
        moment: 'stop',
        lifeNow: progress?.lifeAfter ?? lifeNow,
        assets: { ownedItems: pantry },
        stacks: stacksOf(pantry, catalog),
        now,
    });
    return {
        food: leg.food,
        hpRaw: snapshot.status.currentLifePoints,
        progress,
        defeat,
    };
}

// il combattimento parte dalla vita e dalla dispensa dopo fame e pasto (D-07, D-18)
export function withFoodSettlement<T extends AmbushCharacterSnapshot>(
    snapshot: T,
    settlement: FoodSettlement | null,
): T {
    if (!settlement) return snapshot;
    return {
        ...snapshot,
        status: { ...snapshot.status, currentLifePoints: settlement.lifeAfter },
        assets:
            settlement.ownedItems !== null
                ? { ...snapshot.assets, ownedItems: settlement.ownedItems }
                : snapshot.assets,
    };
}

// un solo pasto per viaggio: uno dei due consumi è sempre vuoto (D-03, D-14)
export function defeatSettlementOf(food: AmbushFood): FoodSettlement | null {
    const { progress, defeat } = food;
    if (!progress) return defeat;
    if (!defeat) return progress;
    return {
        ...progress,
        consumed: [...progress.consumed, ...defeat.consumed],
        ownedItems: defeat.ownedItems ?? progress.ownedItems,
        foodConsumedAt: progress.foodConsumedAt ?? defeat.foodConsumedAt,
    };
}

function legAfterProgress(
    leg: FoodLeg,
    km: number,
    progress: FoodSettlement | null,
): FoodLeg {
    return {
        ...leg,
        food: {
            ...leg.food,
            ...(progress?.curve ?? {}),
            settledKm: Math.max(leg.food.settledKm, km),
            foodConsumedAt: progress?.foodConsumedAt ?? leg.food.foodConsumedAt,
        },
    };
}

function pantryAfter(
    ownedItems: InventoryEntry[],
    progress: FoodSettlement | null,
): InventoryEntry[] {
    return progress?.ownedItems ?? ownedItems;
}
