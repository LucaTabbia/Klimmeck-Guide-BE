import type { Model, Types } from 'mongoose';
import { persistLootItem } from '../fixtures';

// cibo di viaggio per i test della Phase 14 (D-18): nessun seeder, solo fixture

// 23 km scoperti A→B costano 276 HP (D-02): con 1000 HP la partenza senza cibo riesce
export const HARDY_LIFE_POINTS = 1_000;

export function persistFood(
    model: Model<any>,
    power: number,
    overrides: Record<string, unknown> = {},
) {
    return persistLootItem(model, {
        name: `Cibo ${power}`,
        itemType: 'food',
        effect: 'hunger',
        power,
        ...overrides,
    });
}

export function foodStack(item: { _id: unknown }, quantity: number) {
    return {
        itemType: 'LootItem',
        item: item._id as Types.ObjectId,
        quantity,
    };
}
