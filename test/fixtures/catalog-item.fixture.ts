import { Model } from 'mongoose';

/**
 * Two-tier catalog fixtures with deterministic prices (04 D-06): valid against
 * src/models/equipment-item.model.ts and src/models/loot-item.model.ts.
 */
export function buildEquipmentItem(overrides: Record<string, any> = {}) {
    return {
        name: 'Test Sword',
        itemType: 'weapon',
        description: 'Deterministic test equipment',
        rarity: 'common', // RarityType.common
        buyPrice: { gold: 0, silver: 1, copper: 50 },
        sellPrice: { gold: 0, silver: 0, copper: 75 },
        equipType: 'weapon', // EquipType.weapon
        addedSpell: null,
        damages: { base: [], energy: [] },
        ...overrides,
    };
}

export async function persistEquipmentItem(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildEquipmentItem(overrides));
}

export function buildLootItem(overrides: Record<string, any> = {}) {
    return {
        name: 'Test Potion',
        itemType: 'potion',
        description: 'Deterministic test loot',
        rarity: 'common', // RarityType.common
        buyPrice: { gold: 0, silver: 0, copper: 20 },
        sellPrice: { gold: 0, silver: 0, copper: 10 },
        power: 1,
        effect: 'heal', // EffectType.heal
        ...overrides,
    };
}

export async function persistLootItem(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildLootItem(overrides));
}
