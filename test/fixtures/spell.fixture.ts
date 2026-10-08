import { Model } from 'mongoose';

/**
 * Two-tier Spell fixture (D-03/D-04): buildSpell returns a deterministic plain
 * object valid against src/models/spell.model.ts; persistSpell reuses buildSpell
 * to write it on the injected model. No faker, no randomness.
 */
export function buildSpell(overrides: Record<string, any> = {}) {
    return {
        name: 'Test Spell',
        description: 'Deterministic test spell',
        useType: 'attack', // UseType.attack
        energyDamage: { type: 'fire', power: 10 }, // EnergyType.fire
        requiredLearnTime: 0,
        minXpToLearn: 0,
        recoveryTime: 1000,
        maxUsages: 3,
        ...overrides,
    };
}

export async function persistSpell(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildSpell(overrides));
}
