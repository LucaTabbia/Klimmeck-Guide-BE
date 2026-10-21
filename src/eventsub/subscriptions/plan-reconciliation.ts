import type { EventSubSubscription } from 'src/eventsub/helix/twitch-helix.client';
import {
    EVENTSUB_SUBSCRIPTION_VERSION,
    EventSubSubscriptionType,
} from 'src/eventsub/eventsub-types';

export interface DesiredSubscription {
    type: string;
    version: string;
    condition: { broadcaster_user_id: string };
}

export interface ReconciliationPlan {
    keep: EventSubSubscription[];
    remove: EventSubSubscription[];
    create: DesiredSubscription[];
    ignored: EventSubSubscription[];
}

export const ENABLED_STATUS = 'enabled';
export const PENDING_STATUS = 'webhook_callback_verification_pending';

const WEBHOOK_METHOD = 'webhook';
const CONDITION_KEY = 'broadcaster_user_id';
const DESIRED_TYPES = [
    EventSubSubscriptionType.redemptionAdd,
    EventSubSubscriptionType.streamOnline,
];

export function desiredSubscriptions(
    broadcasterId: string,
): DesiredSubscription[] {
    return DESIRED_TYPES.map((type) => ({
        type,
        version: EVENTSUB_SUBSCRIPTION_VERSION,
        condition: { broadcaster_user_id: broadcasterId },
    }));
}

// la lista su Twitch è la verità: si converge alle due subscription desiderate senza toccare ciò che non si possiede (D-14, C5, C7)
export function planReconciliation(
    existing: readonly EventSubSubscription[],
    desired: readonly DesiredSubscription[],
    callbackUrl: string,
): ReconciliationPlan {
    const result: ReconciliationPlan = {
        keep: [],
        remove: [],
        create: [],
        ignored: [],
    };
    const callback = normalizeCallback(callbackUrl);
    for (const wanted of desired) {
        const owned = sortByAge(
            existing.filter((item) => isOwnedBy(item, wanted)),
        );
        const keeper = pickKeeper(owned, wanted, callback);
        if (keeper) result.keep.push(keeper);
        else result.create.push(wanted);
        result.remove.push(...owned.filter((item) => item !== keeper));
    }
    result.ignored = existing.filter(
        (item) => !desired.some((wanted) => isOwnedBy(item, wanted)),
    );
    return result;
}

function isOwnedBy(
    subscription: EventSubSubscription,
    wanted: DesiredSubscription,
): boolean {
    return (
        subscription.transport.method === WEBHOOK_METHOD &&
        subscription.type === wanted.type &&
        subscription.condition[CONDITION_KEY] ===
            wanted.condition.broadcaster_user_id
    );
}

function pickKeeper(
    owned: EventSubSubscription[],
    wanted: DesiredSubscription,
    callback: string,
): EventSubSubscription | undefined {
    const usable = owned.filter(
        (item) => isExactMatch(item, wanted) && hasCallback(item, callback),
    );
    return (
        usable.find((item) => item.status === ENABLED_STATUS) ??
        usable.find((item) => item.status === PENDING_STATUS)
    );
}

function isExactMatch(
    subscription: EventSubSubscription,
    wanted: DesiredSubscription,
): boolean {
    const keys = Object.keys(subscription.condition);
    return (
        subscription.version === wanted.version &&
        keys.length === 1 &&
        keys[0] === CONDITION_KEY
    );
}

function hasCallback(
    subscription: EventSubSubscription,
    callback: string,
): boolean {
    const actual = subscription.transport.callback;
    return actual !== null && normalizeCallback(actual) === callback;
}

function sortByAge(
    subscriptions: EventSubSubscription[],
): EventSubSubscription[] {
    return [...subscriptions].sort(
        (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
    );
}

function normalizeCallback(value: string): string {
    try {
        return new URL(value).href;
    } catch {
        return value;
    }
}
