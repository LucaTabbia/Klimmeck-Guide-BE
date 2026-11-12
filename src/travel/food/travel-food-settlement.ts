// assestamento del cibo di viaggio (Phase 20 D-01, D-03, D-14): fame dal km assestato al bersaglio e pasto una sola volta; unico punto di verità di sweep, imboscata, arrivo e teleport
import {
    applyTradeToInventory,
    type InventoryEntry,
    type InventorySnapshot,
} from 'src/economy/trade/trade-inventory';
import { MIN_LIFE_POINTS } from 'src/quests/outcomes/progression/level-table';
import { travelKmAt } from '../travel-timing';
import {
    type ConsumedFood,
    type FoodSelection,
    type FoodStack,
    selectFood,
} from './food-selection';
import {
    type ActiveTravelFoodDraft,
    coveredKmOf,
    foodNeededFor,
    hpLostFor,
    hungerBetween,
    type TravelFoodCurve,
    uncoveredKmOf,
} from './travel-food';
import { mealLinesOf } from './travel-food.updates';

// progress = sweep e imboscata; arrival = arrivo; stop = sconfitta e teleport (D-03)
export type FoodMoment = 'progress' | 'arrival' | 'stop';

export interface FoodLeg {
    food: ActiveTravelFoodDraft;
    distanceKm: number;
    durationMs: number;
}

export interface FoodSettlementInput {
    leg: FoodLeg;
    targetKm: number;
    moment: FoodMoment;
    lifeNow: number;
    assets: InventorySnapshot;
    stacks: readonly FoodStack[];
    now: Date;
}

export interface FoodCurveRewrite {
    uncoveredKm: number;
    coveredKm: number;
    hpLostTotal: number;
}

export interface FoodSettlement {
    hpLoss: number;
    lifeAfter: number;
    settledKm: number;
    consumed: ConsumedFood[];
    ownedItems: InventoryEntry[] | null;
    foodConsumedAt: Date | null;
    curve: FoodCurveRewrite | null;
}

export interface ReachableTravel {
    road: { distance: number };
    startTime: Date;
    duration: number;
    ambush?: { km?: unknown } | null;
}

const NO_MEAL: FoodSelection = { consumed: [], covered: 0 };

export function settlementOf(
    input: FoodSettlementInput,
): FoodSettlement | null {
    const { leg, targetKm, moment, now } = input;
    const mealDue = mealIsDue(leg.food, targetKm, moment);
    const selection = mealDue
        ? selectFood(mealNeedOf(leg, targetKm, moment), input.stacks)
        : NO_MEAL;
    const curve =
        mealDue && moment === 'progress'
            ? failSafeCurveOf(leg, selection.covered)
            : null;
    const hpLoss = hungerBetween(
        curve ? { distanceKm: leg.distanceKm, ...curve } : curveOf(leg),
        leg.food.settledKm,
        targetKm,
    );
    const { consumed } = selection;
    if (
        hpLoss === 0 &&
        consumed.length === 0 &&
        !(mealDue && moment === 'progress')
    ) {
        return null;
    }
    return {
        hpLoss,
        lifeAfter: lifeAfterHunger(input.lifeNow, hpLoss),
        settledKm: Math.max(leg.food.settledKm, targetKm),
        consumed,
        ownedItems: ownedItemsAfter(input.assets, consumed),
        foodConsumedAt: mealDue ? now : null,
        curve,
    };
}

// lo sweep scrive solo oltre il confine o col pasto pendente (D-15)
export function settlementIsDue(leg: FoodLeg, targetKm: number): boolean {
    return (
        mealIsDue(leg.food, targetKm, 'progress') ||
        hungerBetween(curveOf(leg), leg.food.settledKm, targetKm) > 0
    );
}

// la pedina si ferma al km dell'imboscata pendente (D-16, D-17)
export function reachedKmOf(travel: ReachableTravel, now: Date): number {
    const ambushKm = travel.ambush?.km;
    return Math.min(
        travelKmAt(travel, now),
        typeof ambushKm === 'number' && Number.isFinite(ambushKm)
            ? ambushKm
            : Infinity,
    );
}

// un piano malformato vale «nessun piano» (D-11)
export function foodLegOf(travel: unknown): FoodLeg | null {
    if (!isRecord(travel) || !isRecord(travel.road)) return null;
    const distanceKm = travel.road.distance;
    const durationMs = travel.duration;
    if (!isFiniteNumber(distanceKm) || distanceKm <= 0) return null;
    if (!isFiniteNumber(durationMs) || durationMs < 0) return null;
    const food = foodDraftOf(travel.food);
    return food ? { food, distanceKm, durationMs } : null;
}

function curveOf(leg: FoodLeg): TravelFoodCurve {
    return {
        distanceKm: leg.distanceKm,
        uncoveredKm: leg.food.uncoveredKm,
        hpLostTotal: leg.food.hpLostTotal,
    };
}

// pasto una sola volta: al confine dei km coperti, all'arrivo, alla sosta forzata (D-03)
function mealIsDue(
    food: ActiveTravelFoodDraft,
    targetKm: number,
    moment: FoodMoment,
): boolean {
    if (food.foodConsumedAt !== null) return false;
    return moment !== 'progress' || targetKm >= food.coveredKm;
}

// alla sosta si mangia il cibo dei km percorsi, mai più del piano (D-06)
function mealNeedOf(
    leg: FoodLeg,
    targetKm: number,
    moment: FoodMoment,
): number {
    if (moment !== 'stop' || leg.distanceKm <= 0) return leg.food.needed;
    return Math.min(
        leg.food.needed,
        foodNeededFor((leg.durationMs * targetKm) / leg.distanceKm),
    );
}

// la dispensa reale copre una power diversa dal piano: curva della Phase 14 riscritta (D-19)
function failSafeCurveOf(
    leg: FoodLeg,
    covered: number,
): FoodCurveRewrite | null {
    const uncoveredKm = uncoveredKmOf(leg.food.needed, covered, leg.distanceKm);
    if (uncoveredKm === leg.food.uncoveredKm) return null;
    return {
        uncoveredKm,
        coveredKm: coveredKmOf({ distanceKm: leg.distanceKm, uncoveredKm }),
        hpLostTotal: hpLostFor(uncoveredKm),
    };
}

// mai sotto 1 HP; una vita sopra il massimo scende solo della fame (D-01, D-14)
function lifeAfterHunger(lifeNow: number, hpLoss: number): number {
    return hpLoss > 0 ? Math.max(MIN_LIFE_POINTS, lifeNow - hpLoss) : lifeNow;
}

function ownedItemsAfter(
    assets: InventorySnapshot,
    consumed: ConsumedFood[],
): InventoryEntry[] | null {
    if (consumed.length === 0) return null;
    return applyTradeToInventory(assets, mealLinesOf(consumed)).ownedItems;
}

function foodDraftOf(raw: unknown): ActiveTravelFoodDraft | null {
    if (!isRecord(raw)) return null;
    const { needed, uncoveredKm, coveredKm, hpLostTotal, settledKm } = raw;
    if (!isCount(needed) || !isCount(uncoveredKm)) return null;
    if (!isDistance(coveredKm) || !isDistance(settledKm)) return null;
    if (hpLostTotal !== hpLostFor(uncoveredKm)) return null;
    const foodConsumedAt = raw.foodConsumedAt ?? null;
    if (foodConsumedAt !== null && !(foodConsumedAt instanceof Date)) {
        return null;
    }
    return {
        needed,
        uncoveredKm,
        coveredKm,
        hpLostTotal,
        settledKm,
        foodConsumedAt,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDistance(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0;
}
