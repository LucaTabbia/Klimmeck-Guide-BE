import { Model, Types } from 'mongoose';
import { persistPoi } from './poi.fixture';

/**
 * Two-tier City fixture — valid against src/models/city.model.ts.
 * markerLocation is a REQUIRED ref to PointOfInterest: always an ObjectId here.
 * persistCity creates a real POI (whose `city` points back to the city) when no
 * markerLocation is given and a poiModel is passed.
 */
export function buildCity(overrides: Record<string, any> = {}) {
    return {
        type: 'drusteaCapital', // CityType.drusteaCapital
        name: 'Test City',
        area: [],
        markerLocation: new Types.ObjectId(),
        relatedLore: null,
        pointsOfInterest: [],
        ...overrides,
    };
}

export async function persistCity(
    model: Model<any>,
    overrides: Record<string, any> = {},
    poiModel?: Model<any>,
) {
    if (overrides.markerLocation || !poiModel) {
        return model.create(buildCity(overrides));
    }
    const cityId = overrides._id ?? new Types.ObjectId();
    const poi = await persistPoi(poiModel, { city: cityId });
    return model.create({
        ...buildCity(overrides),
        _id: cityId,
        markerLocation: poi._id,
    });
}
