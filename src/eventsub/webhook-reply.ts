export type WebhookReply =
    | { kind: 'challenge'; challenge: string }
    | { kind: 'noContent' }
    | { kind: 'forbidden' }
    | { kind: 'retryLater' };

export const NO_CONTENT: WebhookReply = { kind: 'noContent' };
export const FORBIDDEN: WebhookReply = { kind: 'forbidden' };
export const RETRY_LATER: WebhookReply = { kind: 'retryLater' };

export const challengeReply = (challenge: string): WebhookReply => ({
    kind: 'challenge',
    challenge,
});
