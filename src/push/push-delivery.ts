import {
    TokenDeliveryOutcome,
    TopicDeliveryOutcome,
    TRANSPORT_ERROR_CODE,
} from 'src/push/transport/push-transport';

export interface PushDeliveryCounts {
    targeted: number;
    sent: number;
    pruned: number;
    failed: number;
}

export enum DeliveryFailureKind {
    staleToken = 'staleToken',
    suspectToken = 'suspectToken',
    payload = 'payload',
    transient = 'transient',
}

// codici FCM reali, identici nelle linee SDK 13 e 14 (RESEARCH Q2), confrontati come stringhe
const STALE_TOKEN_CODES: ReadonlySet<string> = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
]);
const SUSPECT_TOKEN_CODE = 'messaging/invalid-argument';
const PAYLOAD_ERROR_CODES: ReadonlySet<string> = new Set([
    'messaging/invalid-payload',
    'messaging/invalid-data-payload-key',
    'messaging/payload-size-limit-exceeded',
]);

export function classifyDeliveryFailure(
    code: string | undefined,
): DeliveryFailureKind {
    if (code === undefined) return DeliveryFailureKind.transient;
    if (STALE_TOKEN_CODES.has(code)) return DeliveryFailureKind.staleToken;
    if (code === SUSPECT_TOKEN_CODE) return DeliveryFailureKind.suspectToken;
    if (PAYLOAD_ERROR_CODES.has(code)) return DeliveryFailureKind.payload;
    return DeliveryFailureKind.transient;
}

// invalid-argument compare anche con un payload malformato: si pota solo se lo stesso batch ha consegnato almeno un token (Pitfall 4)
export function prunableTokens(
    batch: readonly TokenDeliveryOutcome[],
): string[] {
    const hasWitness = batch.some((outcome) => outcome.delivered);
    return batch
        .filter(
            (outcome) =>
                !outcome.delivered &&
                isPrunable(
                    classifyDeliveryFailure(outcome.errorCode),
                    hasWitness,
                ),
        )
        .map((outcome) => outcome.token);
}

function isPrunable(kind: DeliveryFailureKind, hasWitness: boolean): boolean {
    return (
        kind === DeliveryFailureKind.staleToken ||
        (kind === DeliveryFailureKind.suspectToken && hasWitness)
    );
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        batches.push(items.slice(start, start + size));
    }
    return batches;
}

export function deliveryCountsOf(
    outcomes: readonly TokenDeliveryOutcome[],
    pruned: number,
): PushDeliveryCounts {
    const targeted = outcomes.length;
    const sent = outcomes.filter((outcome) => outcome.delivered).length;
    return { targeted, sent, pruned, failed: targeted - sent };
}

export function topicDeliveryCounts(
    outcome: TopicDeliveryOutcome,
): PushDeliveryCounts {
    const sent = outcome.delivered ? 1 : 0;
    return { targeted: 1, sent, pruned: 0, failed: 1 - sent };
}

export function emptyDelivery(): PushDeliveryCounts {
    return { targeted: 0, sent: 0, pruned: 0, failed: 0 };
}

export function failureCodeSummary(
    outcomes: readonly { errorCode?: string }[],
): string {
    const counts = new Map<string, number>();
    for (const { errorCode } of outcomes) {
        const code = errorCode ?? TRANSPORT_ERROR_CODE;
        counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts].map(([code, count]) => `${code}×${count}`).join(', ');
}

export function describePushError(error: unknown): string {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code = pushErrorCodeOf(error);
    return code === undefined ? name : `${name}, code ${code}`;
}

function pushErrorCodeOf(error: unknown): string | number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const { code } = error as { code?: unknown };
    return typeof code === 'string' || typeof code === 'number'
        ? code
        : undefined;
}
