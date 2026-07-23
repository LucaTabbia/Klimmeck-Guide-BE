import { Model, Types } from 'mongoose';

/**
 * Two-tier PointOfInterest fixture. `location` is required; `city` references a
 * City (a fresh ObjectId by default — override when a real City is needed).
 * Valid against src/models/point-of-interest.model.ts.
 */
export function buildPoi(overrides: Record<string, any> = {}) {
    return {
        type: ['city'], // PoiType.city
        location: [0, 0],
        city: new Types.ObjectId(),
        quest: null,
        ...overrides,
    };
}

export async function persistPoi(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildPoi(overrides));
}
