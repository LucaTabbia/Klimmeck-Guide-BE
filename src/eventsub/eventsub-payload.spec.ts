import {
    parseChallenge,
    parseNotification,
    parseRevocation,
} from 'src/eventsub/eventsub-payload';
import {
    redemptionNotification,
    revocationMessage,
    streamOnlineNotification,
    TEST_CHALLENGE,
    verificationChallenge,
} from '../../test/eventsub/eventsub-fixtures';

const REDEMPTION_TYPE = 'channel.channel_points_custom_reward_redemption.add';
const INVALID_REDEMPTION = {
    kind: 'invalid',
    subscriptionType: REDEMPTION_TYPE,
};
const INVALID_STREAM_ONLINE = {
    kind: 'invalid',
    subscriptionType: 'stream.online',
};
const INVALID_UNKNOWN = { kind: 'invalid', subscriptionType: 'unknown' };
const BAD_TWITCH_IDS: unknown[] = [
    'abc',
    '',
    22222,
    { $gt: '' },
    '1'.repeat(21),
    null,
    undefined,
];

function roundTrip(body: Record<string, unknown>): unknown {
    return JSON.parse(JSON.stringify(body)) as unknown;
}

describe('parseNotification', () => {
    describe('redemption', () => {
        it('reduces the captured body to validated fields', () => {
            expect(parseNotification(redemptionNotification())).toEqual({
                kind: 'redemption',
                event: {
                    id: 'redemption-1',
                    broadcasterUserId: '11111',
                    userId: '22222',
                    rewardId: 'reward-1',
                    cost: 250,
                },
            });
        });

        it('parses the body after a JSON round trip', () => {
            expect(
                parseNotification(roundTrip(redemptionNotification())),
            ).toMatchObject({ kind: 'redemption' });
        });

        it.each([0, -1, 1.5, '250', 2 ** 53, null, undefined])(
            'rejects cost %p',
            (cost) => {
                expect(
                    parseNotification(
                        roundTrip(redemptionNotification({ cost })),
                    ),
                ).toEqual(INVALID_REDEMPTION);
            },
        );

        it('removes reward.cost when the override is undefined', () => {
            const body = redemptionNotification({ cost: undefined });
            const event = body.event as { reward: Record<string, unknown> };
            expect(Object.hasOwn(event.reward, 'cost')).toBe(false);
        });

        it('keeps a null override in the body', () => {
            const body = redemptionNotification({ userId: null });
            const event = body.event as Record<string, unknown>;
            expect(event.user_id).toBeNull();
        });

        it.each(BAD_TWITCH_IDS)('rejects user id %p', (userId) => {
            expect(
                parseNotification(redemptionNotification({ userId })),
            ).toEqual(INVALID_REDEMPTION);
        });

        it.each(BAD_TWITCH_IDS)(
            'rejects broadcaster user id %p',
            (broadcasterUserId) => {
                expect(
                    parseNotification(
                        redemptionNotification({ broadcasterUserId }),
                    ),
                ).toEqual(INVALID_REDEMPTION);
            },
        );

        it.each(['', undefined, null, 7])('rejects event id %p', (eventId) => {
            expect(
                parseNotification(redemptionNotification({ eventId })),
            ).toEqual(INVALID_REDEMPTION);
        });

        it.each(['', 7, undefined])('rejects reward id %p', (rewardId) => {
            expect(
                parseNotification(redemptionNotification({ rewardId })),
            ).toEqual(INVALID_REDEMPTION);
        });

        it('rejects a body without event', () => {
            expect(
                parseNotification(redemptionNotification({ omitEvent: true })),
            ).toEqual(INVALID_REDEMPTION);
        });

        it('rejects a reward that is not an object', () => {
            const body = redemptionNotification();
            (body.event as Record<string, unknown>).reward = ['reward-1'];
            expect(parseNotification(body)).toEqual(INVALID_REDEMPTION);
        });
    });

    describe('stream online', () => {
        it('reduces the captured body to validated fields', () => {
            expect(parseNotification(streamOnlineNotification())).toEqual({
                kind: 'streamOnline',
                event: {
                    id: '53418160',
                    broadcasterUserId: '11111',
                    type: 'live',
                },
            });
        });

        it.each(['live', 'playlist', 'watch_party', 'premiere', 'rerun'])(
            'accepts stream type %s',
            (type) => {
                expect(
                    parseNotification(streamOnlineNotification({ type })),
                ).toEqual({
                    kind: 'streamOnline',
                    event: {
                        id: '53418160',
                        broadcasterUserId: '11111',
                        type,
                    },
                });
            },
        );

        it.each([7, '', undefined])('rejects stream type %p', (type) => {
            expect(
                parseNotification(streamOnlineNotification({ type })),
            ).toEqual(INVALID_STREAM_ONLINE);
        });

        it.each(BAD_TWITCH_IDS)(
            'rejects broadcaster user id %p',
            (broadcasterUserId) => {
                expect(
                    parseNotification(
                        streamOnlineNotification({ broadcasterUserId }),
                    ),
                ).toEqual(INVALID_STREAM_ONLINE);
            },
        );

        it('rejects an empty event id', () => {
            expect(
                parseNotification(streamOnlineNotification({ eventId: '' })),
            ).toEqual(INVALID_STREAM_ONLINE);
        });

        it('rejects a body without event', () => {
            expect(
                parseNotification(
                    streamOnlineNotification({ omitEvent: true }),
                ),
            ).toEqual(INVALID_STREAM_ONLINE);
        });
    });

    it('marks other subscription types as unsupported', () => {
        expect(
            parseNotification({
                subscription: { type: 'stream.offline' },
                event: {},
            }),
        ).toEqual({ kind: 'unsupported', subscriptionType: 'stream.offline' });
    });

    it.each([
        null,
        [],
        {},
        'notification',
        { subscription: { type: 7 } },
        { subscription: { type: '' } },
        { subscription: [] },
    ])('marks %p as invalid with an unknown type', (body) => {
        expect(parseNotification(body)).toEqual(INVALID_UNKNOWN);
    });
});

describe('parseChallenge', () => {
    it('returns the challenge of the verification body', () => {
        expect(parseChallenge(verificationChallenge())).toBe(TEST_CHALLENGE);
    });

    it.each([
        { challenge: '' },
        { challenge: 7 },
        {},
        null,
        [],
        { challenge: 'x'.repeat(1001) },
    ])('returns null for %p', (body) => {
        expect(parseChallenge(body)).toBeNull();
    });

    it('accepts a challenge of exactly 1000 characters', () => {
        const challenge = 'x'.repeat(1000);
        expect(parseChallenge(verificationChallenge(challenge))).toBe(
            challenge,
        );
    });
});

describe('parseRevocation', () => {
    it('reads id, type and status of the revoked subscription', () => {
        expect(
            parseRevocation(
                revocationMessage(REDEMPTION_TYPE, 'authorization_revoked'),
            ),
        ).toEqual({
            subscriptionId: 'sub-revoked',
            type: REDEMPTION_TYPE,
            status: 'authorization_revoked',
        });
    });

    it.each([
        {},
        null,
        { subscription: { id: 1 } },
        { subscription: { id: 'sub', type: 'stream.online' } },
        { subscription: { id: 'sub', type: '', status: 'user_removed' } },
    ])('returns null for %p', (body) => {
        expect(parseRevocation(body)).toBeNull();
    });
});
