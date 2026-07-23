import { Model } from 'mongoose';

/**
 * Two-tier Road fixture. All three required fields (coordinates, length,
 * speedFactor) are provided. Valid against src/models/road.model.ts.
 */
export function buildRoad(overrides: Record<string, any> = {}) {
    return {
        coordinates: [
            [0, 0],
            [1, 1],
        ],
        length: 1,
        speedFactor: 1,
        ...overrides,
    };
}

export async function persistRoad(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildRoad(overrides));
}
