import { Model, Types } from 'mongoose';

/**
 * Two-tier Quest fixture — valid against src/models/quest/**.
 * infos.markerLocation is a REQUIRED ref to PointOfInterest (throwaway ObjectId
 * by default; override with a persisted POI id when a real ref is needed).
 * infos.type uses a valid QuestType value ('hunt').
 */
export function buildQuest(overrides: Record<string, any> = {}) {
    return {
        infos: {
            title: 'Test Quest',
            type: 'hunt', // QuestType.hunt
            markerLocation: new Types.ObjectId(), // ref POI (required)
            relatedLore: [],
            timeToComplete: null,
            enemy: null,
        },
        requirements: {
            requiredPoints: null,
            requiredAdventurers: 0,
            recommendedLoot: [],
            minTitle: 'rookie', // TitleType.rookie
        },
        prizes: {
            prizeCoins: null,
            xpPrize: null,
            prizeItem: null,
            randomLoot: [],
        },
        registeredAdventurers: [],
        ...overrides,
    };
}

export async function persistQuest(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildQuest(overrides));
}
