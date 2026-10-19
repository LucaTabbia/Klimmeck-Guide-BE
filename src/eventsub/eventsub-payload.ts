import { TWITCH_USER_ID_PATTERN } from 'src/config/eventsub-config';
import { EventSubSubscriptionType } from 'src/eventsub/eventsub-types';

export interface RedemptionEvent {
    id: string;
    broadcasterUserId: string;
    userId: string;
    rewardId: string;
    cost: number;
}

export interface StreamOnlineEvent {
    id: string;
    broadcasterUserId: string;
    type: string;
}

export interface RevocationNotice {
    subscriptionId: string;
    type: string;
    status: string;
}

export type NotificationPayload =
    | { kind: 'redemption'; event: RedemptionEvent }
    | { kind: 'streamOnline'; event: StreamOnlineEvent }
    | { kind: 'unsupported'; subscriptionType: string }
    | { kind: 'invalid'; subscriptionType: string };

export const UNKNOWN_SUBSCRIPTION_TYPE = 'unknown';
export const MAX_CHALLENGE_LENGTH = 1000;

type JsonRecord = Record<string, unknown>;

const NOTIFICATION_PARSERS = new Map<
    string,
    (event: JsonRecord) => NotificationPayload | null
>([
    [EventSubSubscriptionType.redemptionAdd, toRedemptionPayload],
    [EventSubSubscriptionType.streamOnline, toStreamOnlinePayload],
]);

// solo stringhe validate e interi positivi sicuri: nessun valore del body arriva grezzo a un filtro Mongo
export function parseNotification(body: unknown): NotificationPayload {
    const record = asRecord(body);
    const subscriptionType = nonEmptyString(
        asRecord(record?.subscription)?.type,
    );
    if (!subscriptionType) return invalid(UNKNOWN_SUBSCRIPTION_TYPE);
    const parse = NOTIFICATION_PARSERS.get(subscriptionType);
    if (!parse) return { kind: 'unsupported', subscriptionType };
    const event = asRecord(record?.event);
    return (event && parse(event)) ?? invalid(subscriptionType);
}

export function parseChallenge(body: unknown): string | null {
    const challenge = nonEmptyString(asRecord(body)?.challenge);
    if (!challenge || challenge.length > MAX_CHALLENGE_LENGTH) return null;
    return challenge;
}

export function parseRevocation(body: unknown): RevocationNotice | null {
    const subscription = asRecord(asRecord(body)?.subscription);
    const subscriptionId = nonEmptyString(subscription?.id);
    const type = nonEmptyString(subscription?.type);
    const status = nonEmptyString(subscription?.status);
    if (!subscriptionId || !type || !status) return null;
    return { subscriptionId, type, status };
}

function parseRedemptionEvent(event: JsonRecord): RedemptionEvent | null {
    const reward = asRecord(event.reward);
    const id = nonEmptyString(event.id);
    const broadcasterUserId = twitchUserId(event.broadcaster_user_id);
    const userId = twitchUserId(event.user_id);
    const rewardId = nonEmptyString(reward?.id);
    const cost = positiveSafeInteger(reward?.cost);
    if (!id || !broadcasterUserId || !userId || !rewardId || !cost) {
        return null;
    }
    return { id, broadcasterUserId, userId, rewardId, cost };
}

function parseStreamOnlineEvent(event: JsonRecord): StreamOnlineEvent | null {
    const id = nonEmptyString(event.id);
    const broadcasterUserId = twitchUserId(event.broadcaster_user_id);
    const type = nonEmptyString(event.type);
    if (!id || !broadcasterUserId || !type) return null;
    return { id, broadcasterUserId, type };
}

function toRedemptionPayload(event: JsonRecord): NotificationPayload | null {
    const redemption = parseRedemptionEvent(event);
    return redemption && { kind: 'redemption', event: redemption };
}

function toStreamOnlinePayload(event: JsonRecord): NotificationPayload | null {
    const streamOnline = parseStreamOnlineEvent(event);
    return streamOnline && { kind: 'streamOnline', event: streamOnline };
}

function invalid(subscriptionType: string): NotificationPayload {
    return { kind: 'invalid', subscriptionType };
}

function asRecord(value: unknown): JsonRecord | null {
    if (typeof value !== 'object' || value === null) return null;
    if (Array.isArray(value)) return null;
    return value as JsonRecord;
}

function nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function twitchUserId(value: unknown): string | null {
    const id = nonEmptyString(value);
    return id && TWITCH_USER_ID_PATTERN.test(id) ? id : null;
}

function positiveSafeInteger(value: unknown): number | null {
    if (typeof value !== 'number') return null;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}
