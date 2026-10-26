import { Model } from 'mongoose';

/**
 * Enemy fixture — valid against src/models/enemy.model.ts, at the D-12 scale
 * (starting HP 1000). `locations` is omitted: the schema declares it as a
 * single String, so an array fails the cast (deferred-items.md).
 */
export function buildEnemy(overrides: Record<string, any> = {}) {
    return {
        name: 'Test Bandit',
        energyWeaknesses: [],
        baseWeaknesses: [],
        relatedLore: [],
        xp: 100,
        spells: [],
        lifePoints: 1000,
        imagePath: 'enemies/test.png',
        damages: { base: [{ type: 'cut', power: 100 }], energy: [] },
        ...overrides,
    };
}

export async function persistEnemy(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildEnemy(overrides));
}
