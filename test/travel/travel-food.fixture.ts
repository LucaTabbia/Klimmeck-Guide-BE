import type { Model, Types } from 'mongoose';
import { persistLootItem } from '../fixtures';

// cibo di viaggio per i test della Phase 14 (D-18): nessun seeder, solo fixture

// 1000 HP reggono 44 km scoperti (D-02): la partenza senza cibo riesce; A→B di travel-world misura ~0,44 km (2 power, 1 HP senza cibo)
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
