import { Model } from 'mongoose';

/**
 * Two-tier Pet fixture — valid against src/models/pet.model.ts and complete
 * for the wire (every non-null GraphQL field is set). speedModifier null = not
 * rideable (D-08); override it to build a mount.
 */
export function buildPet(overrides: Record<string, any> = {}) {
    return {
        name: 'Test Mount',
        damages: { base: [], energy: [] },
        buyPrice: { gold: 0, silver: 1, copper: 0 },
        sellPrice: { gold: 0, silver: 0, copper: 50 },
        xp: 0,
        maxXp: 100,
        currentLifePoints: 10,
        maxLifePoints: 10,
        imagePath: 'pets/test-mount.png',
        speedModifier: null,
        ...overrides,
    };
}

export async function persistPet(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildPet(overrides));
}
