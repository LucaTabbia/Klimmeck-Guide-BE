import { Model } from 'mongoose';

export function buildLore(overrides: Record<string, any> = {}) {
    return {
        type: 'knowledge',
        image: null,
        name: 'Test Lore',
        description: 'Una voce di prova.',
        relatedLore: [],
        ...overrides,
    };
}

export async function persistLore(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildLore(overrides));
}
