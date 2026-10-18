import {
    chunk,
    classifyDeliveryFailure,
    DeliveryFailureKind,
    deliveryCountsOf,
    describePushError,
    emptyDelivery,
    failureCodeSummary,
    failuresByKind,
    prunableTokens,
    topicDeliveryCounts,
} from 'src/push/push-delivery';

const NOT_REGISTERED = 'messaging/registration-token-not-registered';
const INVALID_TOKEN = 'messaging/invalid-registration-token';
const INVALID_ARGUMENT = 'messaging/invalid-argument';
const SERVER_UNAVAILABLE = 'messaging/server-unavailable';
const INTERNAL_ERROR = 'messaging/internal-error';

describe('classifyDeliveryFailure', () => {
    it.each([NOT_REGISTERED, INVALID_TOKEN])(
        'treats %s as a stale token',
        (code) => {
            expect(classifyDeliveryFailure(code)).toBe(
                DeliveryFailureKind.staleToken,
            );
        },
    );

    it.each([
        INVALID_ARGUMENT,
        'messaging/invalid-payload',
        'messaging/invalid-data-payload-key',
        'messaging/payload-size-limit-exceeded',
    ])('treats %s as a payload error', (code) => {
        expect(classifyDeliveryFailure(code)).toBe(DeliveryFailureKind.payload);
    });

    it.each([
        SERVER_UNAVAILABLE,
        INTERNAL_ERROR,
        'messaging/message-rate-exceeded',
        'messaging/device-message-rate-exceeded',
        'messaging/third-party-auth-error',
        'messaging/mismatched-credential',
        'messaging/authentication-error',
        'messaging/unknown-error',
        'transport-error',
        'push-disabled',
        undefined,
    ])('treats %s as transient', (code) => {
        expect(classifyDeliveryFailure(code)).toBe(
            DeliveryFailureKind.transient,
        );
    });
});

describe('prunableTokens', () => {
    it('prunes only the stale token codes', () => {
        expect(
            prunableTokens([
                { token: 'a', delivered: false, errorCode: NOT_REGISTERED },
                { token: 'b', delivered: false, errorCode: INVALID_TOKEN },
                { token: 'c', delivered: true },
            ]),
        ).toEqual(['a', 'b']);
    });

    it('never prunes invalid-argument, even when the same batch delivered other tokens', () => {
        expect(
            prunableTokens([
                { token: 'a', delivered: true },
                { token: 'b', delivered: false, errorCode: INVALID_ARGUMENT },
            ]),
        ).toEqual([]);
    });

    it('never prunes transient failures', () => {
        expect(
            prunableTokens([
                { token: 'a', delivered: false, errorCode: SERVER_UNAVAILABLE },
                { token: 'b', delivered: false, errorCode: SERVER_UNAVAILABLE },
            ]),
        ).toEqual([]);
    });
});

describe('failuresByKind', () => {
    it('classifies every failed outcome once and skips delivered ones', () => {
        const groups = failuresByKind([
            { token: 'a', delivered: true },
            { token: 'b', delivered: false, errorCode: NOT_REGISTERED },
            { token: 'c', delivered: false, errorCode: INVALID_ARGUMENT },
            { token: 'd', delivered: false, errorCode: SERVER_UNAVAILABLE },
            { token: 'e', delivered: false },
        ]);

        expect(
            groups[DeliveryFailureKind.staleToken].map((o) => o.token),
        ).toEqual(['b']);
        expect(groups[DeliveryFailureKind.payload].map((o) => o.token)).toEqual(
            ['c'],
        );
        expect(
            groups[DeliveryFailureKind.transient].map((o) => o.token),
        ).toEqual(['d', 'e']);
    });

    it('returns empty groups when every token was delivered', () => {
        expect(failuresByKind([{ token: 'a', delivered: true }])).toEqual({
            [DeliveryFailureKind.staleToken]: [],
            [DeliveryFailureKind.payload]: [],
            [DeliveryFailureKind.transient]: [],
        });
    });
});

describe('chunk', () => {
    it('splits into batches of the given size', () => {
        const items = Array.from({ length: 1001 }, (_, index) => index + 1);

        expect(chunk(items, 500).map((batch) => batch.length)).toEqual([
            500, 500, 1,
        ]);
    });

    it('returns no batch for an empty list', () => {
        expect(chunk([], 500)).toEqual([]);
    });
});

describe('delivery counts', () => {
    it('counts targeted, sent, pruned and failed tokens', () => {
        expect(
            deliveryCountsOf(
                [
                    { token: 'a', delivered: true },
                    { token: 'b', delivered: false },
                    { token: 'c', delivered: false },
                ],
                1,
            ),
        ).toEqual({ targeted: 3, sent: 1, pruned: 1, failed: 2 });
    });

    it('counts a delivered topic send', () => {
        expect(topicDeliveryCounts({ delivered: true })).toEqual({
            targeted: 1,
            sent: 1,
            pruned: 0,
            failed: 0,
        });
    });

    it('counts a failed topic send', () => {
        expect(
            topicDeliveryCounts({ delivered: false, errorCode: 'x' }),
        ).toEqual({ targeted: 1, sent: 0, pruned: 0, failed: 1 });
    });

    it('returns a fresh empty report on every call', () => {
        const first = emptyDelivery();

        expect(first).toEqual({ targeted: 0, sent: 0, pruned: 0, failed: 0 });
        expect(emptyDelivery()).not.toBe(first);
    });
});

describe('failureCodeSummary', () => {
    it('counts codes in order of first appearance without the tokens', () => {
        const summary = failureCodeSummary([
            { token: 'tok-1', delivered: false, errorCode: SERVER_UNAVAILABLE },
            { token: 'tok-2', delivered: false, errorCode: SERVER_UNAVAILABLE },
            { token: 'tok-3', delivered: false, errorCode: INTERNAL_ERROR },
        ] as readonly { errorCode?: string }[]);

        expect(summary).toBe(
            'messaging/server-unavailable×2, messaging/internal-error×1',
        );
        expect(summary).not.toContain('tok-');
    });

    it('reports a missing code as transport-error', () => {
        expect(failureCodeSummary([{}])).toBe('transport-error×1');
    });
});

describe('describePushError', () => {
    it('reports the name and code, never the message', () => {
        const description = describePushError(
            Object.assign(new Error('tok-secret leaked'), {
                code: INTERNAL_ERROR,
            }),
        );

        expect(description).toBe('Error, code messaging/internal-error');
        expect(description).not.toContain('tok-secret');
    });

    it('reports a non-error value as UnknownError', () => {
        expect(describePushError('x')).toBe('UnknownError');
    });
});
