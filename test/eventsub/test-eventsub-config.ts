import type {
    LocalEventSubConfig,
    ManagedEventSubConfig,
} from 'src/config/eventsub-config';
import { TEST_BROADCASTER_ID, TEST_EVENTSUB_SECRET } from './eventsub-fixtures';

export const TEST_CALLBACK_URL =
    'https://klimmeck.test/webhooks/twitch/eventsub';
export const TEST_LOCAL_CALLBACK_URL =
    'http://localhost:3000/webhooks/twitch/eventsub';
export const TEST_HELIX_CLIENT_ID = 'test-client-id';
export const TEST_HELIX_CLIENT_SECRET = 'test-client-secret';

export function buildTestEventSubConfig(
    overrides: Partial<ManagedEventSubConfig> = {},
): ManagedEventSubConfig {
    return {
        mode: 'managed',
        secret: TEST_EVENTSUB_SECRET,
        callbackUrl: TEST_CALLBACK_URL,
        broadcasterId: TEST_BROADCASTER_ID,
        clientId: TEST_HELIX_CLIENT_ID,
        clientSecret: TEST_HELIX_CLIENT_SECRET,
        reconcileIntervalMs: 0,
        ...overrides,
        mode: 'managed',
    };
}

export function buildLocalEventSubConfig(): LocalEventSubConfig {
    return {
        mode: 'local',
        secret: TEST_EVENTSUB_SECRET,
        callbackUrl: TEST_LOCAL_CALLBACK_URL,
        broadcasterId: TEST_BROADCASTER_ID,
    };
}
