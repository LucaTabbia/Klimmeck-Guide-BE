import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EventSubHeaders } from 'src/eventsub/eventsub-headers';

export const REPLAY_WINDOW_MS = 10 * 60 * 1000;
export const MAX_FUTURE_SKEW_MS = 60 * 1000;

const SIGNATURE_PREFIX = 'sha256=';

export type SignedHeaders = Pick<
    EventSubHeaders,
    'messageId' | 'timestamp' | 'signature'
>;

// HMAC sui byte grezzi (ordine id ‖ timestamp ‖ body) e confronto a tempo costante (D-02)
export function verifyEventSubSignature(
    headers: SignedHeaders,
    rawBody: Buffer | undefined,
    secret: string,
    now: Date,
): boolean {
    if (!rawBody || !secret) return false;
    const expected = Buffer.from(
        SIGNATURE_PREFIX +
            createHmac('sha256', secret)
                .update(headers.messageId)
                .update(headers.timestamp)
                .update(rawBody)
                .digest('hex'),
    );
    const received = Buffer.from(headers.signature);
    if (expected.length !== received.length) return false;
    if (!timingSafeEqual(expected, received)) return false;
    return isWithinReplayWindow(headers.timestamp, now);
}

function isWithinReplayWindow(timestamp: string, now: Date): boolean {
    const sentAt = Date.parse(timestamp);
    if (!Number.isFinite(sentAt)) return false;
    const age = now.getTime() - sentAt;
    return age <= REPLAY_WINDOW_MS && -age <= MAX_FUTURE_SKEW_MS;
}
