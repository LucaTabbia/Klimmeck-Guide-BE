import { createHmac, randomUUID } from 'node:crypto';
import { EVENTSUB_HEADER } from 'src/eventsub/eventsub-headers';
import {
    EVENTSUB_SUBSCRIPTION_VERSION,
    EventSubSubscriptionType,
} from 'src/eventsub/eventsub-types';

export const TEST_EVENTSUB_SECRET = 'test-eventsub-secret-0123456789';
export const TEST_BROADCASTER_ID = '11111';
export const TEST_VIEWER_TWITCH_ID = '22222';
export const TEST_CHALLENGE = 'pogchamp-kappa-360noscope-vohiyo';

const TEST_CALLBACK = 'http://localhost:3000/webhooks/twitch/eventsub';
const TEST_CREATED_AT = '2026-10-19T17:09:43.226869Z';

export function signEventSub(
    secret: string,
    messageId: string,
    timestamp: string,
    body: string,
): string {
    return (
        'sha256=' +
        createHmac('sha256', secret)
            .update(messageId + timestamp + body)
            .digest('hex')
    );
}

export interface SignedEventSubRequest {
    headers: Record<string, string>;
    body: string;
    messageId: string;
}

export function signedEventSubRequest(options: {
    messageType: string;
    body: Record<string, unknown>;
    messageId?: string;
    timestamp?: string;
    secret?: string;
}): SignedEventSubRequest {
    const messageId = options.messageId ?? randomUUID();
    const timestamp = options.timestamp ?? new Date().toISOString();
    const secret = options.secret ?? TEST_EVENTSUB_SECRET;
    const body = JSON.stringify(options.body);
    return {
        headers: {
            [EVENTSUB_HEADER.messageId]: messageId,
            [EVENTSUB_HEADER.timestamp]: timestamp,
            [EVENTSUB_HEADER.signature]: signEventSub(
                secret,
                messageId,
                timestamp,
                body,
            ),
            [EVENTSUB_HEADER.messageType]: options.messageType,
            'twitch-eventsub-message-retry': '0',
        },
        body,
        messageId,
    };
}

export interface RedemptionOverrides {
    eventId?: unknown;
    userId?: unknown;
    broadcasterUserId?: unknown;
    cost?: unknown;
    rewardId?: unknown;
    omitEvent?: boolean;
}

export interface StreamOnlineOverrides {
    eventId?: unknown;
    broadcasterUserId?: unknown;
    type?: unknown;
    omitEvent?: boolean;
}

type Fields = Record<string, unknown>;

// una chiave presente vince anche se null o undefined; undefined toglie il campo dal body
function writeField<O extends object>(
    target: Fields,
    field: string,
    overrides: O,
    key: keyof O & string,
    fallback: unknown,
): void {
    const value = Object.hasOwn(overrides, key)
        ? (overrides as Fields)[key]
        : fallback;
    if (value === undefined) return;
    target[field] = value;
}

function notificationSubscription(type: string): Fields {
    return {
        id: `sub-${type}`,
        status: 'enabled',
        type,
        version: EVENTSUB_SUBSCRIPTION_VERSION,
        condition: { broadcaster_user_id: TEST_BROADCASTER_ID },
        transport: { method: 'webhook', callback: TEST_CALLBACK },
        created_at: TEST_CREATED_AT,
        cost: 0,
    };
}

export function redemptionNotification(
    overrides: RedemptionOverrides = {},
): Record<string, unknown> {
    const subscription = notificationSubscription(
        EventSubSubscriptionType.redemptionAdd,
    );
    if (overrides.omitEvent) return { subscription };
    const reward: Fields = {};
    writeField(reward, 'id', overrides, 'rewardId', 'reward-1');
    reward.title = 'Test Reward from CLI';
    writeField(reward, 'cost', overrides, 'cost', 250);
    reward.prompt = 'Redeem Your Test Reward from CLI';
    const event: Fields = {};
    writeField(event, 'id', overrides, 'eventId', 'redemption-1');
    writeField(
        event,
        'broadcaster_user_id',
        overrides,
        'broadcasterUserId',
        TEST_BROADCASTER_ID,
    );
    event.broadcaster_user_login = 'testBroadcaster';
    event.broadcaster_user_name = 'testBroadcaster';
    writeField(event, 'user_id', overrides, 'userId', TEST_VIEWER_TWITCH_ID);
    event.user_login = 'testFromUser';
    event.user_name = 'testFromUser';
    event.user_input = 'Test Input From CLI';
    event.status = 'unfulfilled';
    event.reward = reward;
    event.redeemed_at = TEST_CREATED_AT;
    return { subscription, event };
}

export function streamOnlineNotification(
    overrides: StreamOnlineOverrides = {},
): Record<string, unknown> {
    const subscription = notificationSubscription(
        EventSubSubscriptionType.streamOnline,
    );
    if (overrides.omitEvent) return { subscription };
    const event: Fields = {};
    writeField(event, 'id', overrides, 'eventId', '53418160');
    writeField(
        event,
        'broadcaster_user_id',
        overrides,
        'broadcasterUserId',
        TEST_BROADCASTER_ID,
    );
    event.broadcaster_user_login = 'testBroadcaster';
    event.broadcaster_user_name = 'testBroadcaster';
    writeField(event, 'type', overrides, 'type', 'live');
    event.started_at = TEST_CREATED_AT;
    return { subscription, event };
}

export function verificationChallenge(
    challenge: string = TEST_CHALLENGE,
    type: string = EventSubSubscriptionType.redemptionAdd,
): Record<string, unknown> {
    return {
        challenge,
        subscription: {
            ...notificationSubscription(type),
            status: 'webhook_callback_verification_pending',
        },
    };
}

export function revocationMessage(
    type: string,
    status: string,
    subscriptionId = 'sub-revoked',
): Record<string, unknown> {
    return {
        subscription: {
            ...notificationSubscription(type),
            id: subscriptionId,
            status,
        },
    };
}
