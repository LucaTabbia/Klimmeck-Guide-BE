import { Model, Types } from 'mongoose';

/**
 * QuestResult fixture valid against src/models/quest-result/quest-result.model.ts
 * (D-19): a fresh character and user per call, nullable refs at null, no rescued characters, D-12 scale
 * (1000 HP), an empty enemies list `[{ enemy, quantity }]` and no dungeon stages (D-01).
 * Overrides replace whole top-level fields.
 */
export function buildQuestResult(overrides: Record<string, any> = {}) {
    return {
        character: new Types.ObjectId(),
        user: new Types.ObjectId(),
        kind: 'quest',
        quest: { id: new Types.ObjectId(), type: 'job', title: 'Test Job' },
        outcome: 'success',
        resolvedAt: new Date('2026-10-24T10:00:00.000Z'),
        hpBefore: 1000,
        hpAfter: 1000,
        maxLifePoints: 1000,
        injuriesAdded: [],
        injuriesHealed: [],
        consumablesUsed: [],
        spellsUsed: [],
        rewards: { coins: { gold: 0, silver: 0, copper: 0 }, items: [] },
        xpGained: 0,
        petXpGained: 0,
        xpBefore: 0,
        xpAfter: 0,
        levelBefore: 1,
        levelAfter: 1,
        titleBefore: 'rookie',
        titleAfter: 'rookie',
        spellLearned: null,
        loreUnlocked: [],
        enemies: [],
        stagesCleared: null,
        stagesTotal: null,
        rescuedCharacters: [],
        arrested: false,
        coinsLost: null,
        guardEncounter: false,
        ...overrides,
    };
}

export async function persistQuestResult(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildQuestResult(overrides));
}
