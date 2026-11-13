import { Types } from 'mongoose';

const DEFAULT_START = new Date('2026-10-21T08:00:00.000Z');
const DEFAULT_END = new Date('2026-10-21T09:00:00.000Z');

// documento activeTravel persistito per i test (nome distinto dal buildActiveTravel di produzione)
export function buildActiveTravelDoc(overrides: Record<string, any> = {}) {
    const startTime: Date = overrides.startTime ?? DEFAULT_START;
    const endTime: Date = overrides.endTime ?? DEFAULT_END;
    return {
        road: {
            coordinates: [
                [0, 0],
                [0, 0.2],
            ],
            distance: 0.44,
        },
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        to: new Types.ObjectId(),
        kind: 'free',
        ...overrides,
    };
}

export const FOOD_TRAVEL_KM = 20;

// 20 km in un'ora (1 km ogni 3 minuti), 20 power di fabbisogno, 10 power posseduti: 10 km scoperti, 55 HP (Phase 14 D-02)
export function buildActiveTravelFood(overrides: Record<string, unknown> = {}) {
    return {
        needed: 20,
        uncoveredKm: 10,
        coveredKm: 10,
        hpLostTotal: 55,
        settledKm: 0,
        foodConsumedAt: null,
        ...overrides,
    };
}

// food null = viaggio legacy senza piano (D-11)
export function buildFoodTravelDoc(
    food: Record<string, unknown> | null = {},
    overrides: Record<string, any> = {},
) {
    return buildActiveTravelDoc({
        road: {
            coordinates: [
                [0, 0],
                [0, 9],
            ],
            distance: FOOD_TRAVEL_KM,
        },
        ...(food ? { food: buildActiveTravelFood(food) } : {}),
        ...overrides,
    });
}
