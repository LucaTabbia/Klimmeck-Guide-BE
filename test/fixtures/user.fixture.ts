import { Model } from 'mongoose';

/**
 * Two-tier User fixture. Deterministic values only — twitchId is a fake test
 * identifier ('twitch-test-1'), never a real Twitch id (threat T-01-04).
 * Valid against src/models/user.model.ts.
 */
export function buildUser(overrides: Record<string, any> = {}) {
    return {
        twitchId: 'twitch-test-1',
        twitchPoints: 0,
        role: 'adventurer', // RoleType.adventurer
        currentCharacter: null,
        ...overrides,
    };
}

export async function persistUser(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildUser(overrides));
}
