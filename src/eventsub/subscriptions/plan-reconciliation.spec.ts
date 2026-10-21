import type { EventSubSubscription } from '../helix/twitch-helix.client';
import { EventSubSubscriptionType } from '../eventsub-types';
import {
    desiredSubscriptions,
    planReconciliation,
} from './plan-reconciliation';

const CALLBACK = 'https://klimmeck.test/webhooks/twitch/eventsub';
const BROADCASTER = '11111';
const REDEMPTION = EventSubSubscriptionType.redemptionAdd;
const STREAM_ONLINE = EventSubSubscriptionType.streamOnline;
const desired = desiredSubscriptions(BROADCASTER);

function sub(
    overrides: Partial<EventSubSubscription> = {},
): EventSubSubscription {
    return {
        id: 'a',
        status: 'enabled',
        type: REDEMPTION,
        version: '1',
        condition: { broadcaster_user_id: BROADCASTER },
        transport: { method: 'webhook', callback: CALLBACK },
        createdAt: '2026-10-19T00:00:00.000Z',
        ...overrides,
    };
}

function plan(existing: EventSubSubscription[]) {
    return planReconciliation(existing, desired, CALLBACK);
}

function ids(subscriptions: EventSubSubscription[]): string[] {
    return subscriptions.map((subscription) => subscription.id);
}

function createdTypes(existing: EventSubSubscription[]): string[] {
    return plan(existing).create.map((subscription) => subscription.type);
}

describe('desiredSubscriptions', () => {
    it('wants the redemption and stream.online subscriptions of the broadcaster', () => {
        expect(desiredSubscriptions(BROADCASTER)).toEqual([
            {
                type: 'channel.channel_points_custom_reward_redemption.add',
                version: '1',
                condition: { broadcaster_user_id: '11111' },
            },
            {
                type: 'stream.online',
                version: '1',
                condition: { broadcaster_user_id: '11111' },
            },
        ]);
    });
});

describe('planReconciliation', () => {
    it('creates both subscriptions when Twitch has none (row 8)', () => {
        expect(plan([])).toEqual({
            keep: [],
            remove: [],
            create: desired,
            ignored: [],
        });
    });

    it('keeps enabled subscriptions with the same callback (row 1)', () => {
        const redemption = sub({ id: 'r' });
        const online = sub({ id: 'o', type: STREAM_ONLINE });

        expect(plan([redemption, online])).toEqual({
            keep: [redemption, online],
            remove: [],
            create: [],
            ignored: [],
        });
    });

    it('keeps a subscription whose verification is pending (row 2)', () => {
        const pending = sub({
            status: 'webhook_callback_verification_pending',
        });

        const result = plan([pending]);

        expect(result.keep).toEqual([pending]);
        expect(result.remove).toEqual([]);
        expect(createdTypes([pending])).toEqual([STREAM_ONLINE]);
    });

    it.each([
        'webhook_callback_verification_failed',
        'notification_failures_exceeded',
        'authorization_revoked',
        'user_removed',
        'version_removed',
        'moderator_removed',
        'beta_maintenance',
        'some_future_status',
    ])(
        'removes and recreates a subscription in status %s (row 3)',
        (status) => {
            const broken = sub({ id: 'broken', status });

            const result = plan([broken]);

            expect(result.keep).toEqual([]);
            expect(ids(result.remove)).toEqual(['broken']);
            expect(createdTypes([broken])).toEqual([REDEMPTION, STREAM_ONLINE]);
        },
    );

    it('removes and recreates an enabled subscription on another callback (row 4)', () => {
        const moved = sub({
            id: 'moved',
            transport: {
                method: 'webhook',
                callback: 'https://old.klimmeck.test/webhooks/twitch/eventsub',
            },
        });

        const result = plan([moved]);

        expect(ids(result.remove)).toEqual(['moved']);
        expect(createdTypes([moved])).toEqual([REDEMPTION, STREAM_ONLINE]);
    });

    it('compares callbacks after URL normalization', () => {
        const sameHref = sub({
            transport: {
                method: 'webhook',
                callback: 'https://KLIMMECK.test:443/webhooks/twitch/eventsub',
            },
        });

        expect(plan([sameHref]).keep).toEqual([sameHref]);
    });

    it('treats a trailing slash as a different callback path', () => {
        const trailingSlash = sub({
            id: 'slash',
            transport: {
                method: 'webhook',
                callback: 'https://klimmeck.test/webhooks/twitch/eventsub/',
            },
        });

        const result = plan([trailingSlash]);

        expect(ids(result.remove)).toEqual(['slash']);
        expect(createdTypes([trailingSlash])).toEqual([
            REDEMPTION,
            STREAM_ONLINE,
        ]);
    });

    it('keeps the oldest of several enabled subscriptions (row 5)', () => {
        const newer = sub({ id: 'new', createdAt: '2026-10-19T00:00:01.000Z' });
        const older = sub({ id: 'old', createdAt: '2026-10-19T00:00:00.000Z' });

        const result = plan([newer, older]);

        expect(ids(result.keep)).toEqual(['old']);
        expect(ids(result.remove)).toEqual(['new']);
        expect(createdTypes([newer, older])).toEqual([STREAM_ONLINE]);
    });

    it('prefers an enabled subscription over a pending one (row 5)', () => {
        const pending = sub({
            id: 'pending',
            status: 'webhook_callback_verification_pending',
            createdAt: '2026-10-19T00:00:00.000Z',
        });
        const enabled = sub({
            id: 'enabled',
            createdAt: '2026-10-19T00:00:05.000Z',
        });

        const result = plan([pending, enabled]);

        expect(ids(result.keep)).toEqual(['enabled']);
        expect(ids(result.remove)).toEqual(['pending']);
    });

    it('removes a variant with an extra condition key and creates the desired one (row 6)', () => {
        const variant = sub({
            id: 'variant',
            condition: { broadcaster_user_id: BROADCASTER, reward_id: 'r1' },
        });

        const result = plan([variant]);

        expect(ids(result.remove)).toEqual(['variant']);
        expect(result.ignored).toEqual([]);
        expect(createdTypes([variant])).toEqual([REDEMPTION, STREAM_ONLINE]);
    });

    it('removes a variant with another version (row 6)', () => {
        const otherVersion = sub({ id: 'v2', version: '2' });
        const exact = sub({ id: 'exact' });

        const result = plan([otherVersion, exact]);

        expect(ids(result.keep)).toEqual(['exact']);
        expect(ids(result.remove)).toEqual(['v2']);
    });

    it('ignores subscriptions it does not own (row 7)', () => {
        const offline = sub({ id: 'offline', type: 'stream.offline' });
        const otherBroadcaster = sub({
            id: 'other',
            condition: { broadcaster_user_id: '99999' },
        });
        const websocket = sub({
            id: 'ws',
            transport: { method: 'websocket', callback: null },
        });

        const result = plan([offline, otherBroadcaster, websocket]);

        expect(ids(result.ignored)).toEqual(['offline', 'other', 'ws']);
        expect(result.remove).toEqual([]);
        expect(result.keep).toEqual([]);
        expect(createdTypes([offline, otherBroadcaster, websocket])).toEqual([
            REDEMPTION,
            STREAM_ONLINE,
        ]);
    });

    it('orders removals by desired type, then by creation time', () => {
        const onlineBroken = sub({
            id: 'online-broken',
            type: STREAM_ONLINE,
            status: 'authorization_revoked',
            createdAt: '2026-10-19T00:00:00.000Z',
        });
        const redemptionLate = sub({
            id: 'redemption-late',
            status: 'user_removed',
            createdAt: '2026-10-19T00:00:09.000Z',
        });
        const redemptionEarly = sub({
            id: 'redemption-early',
            version: '2',
            createdAt: '2026-10-19T00:00:01.000Z',
        });

        const result = plan([onlineBroken, redemptionLate, redemptionEarly]);

        expect(ids(result.remove)).toEqual([
            'redemption-early',
            'redemption-late',
            'online-broken',
        ]);
        expect(result.create.map((item) => item.type)).toEqual([
            REDEMPTION,
            STREAM_ONLINE,
        ]);
    });
});
