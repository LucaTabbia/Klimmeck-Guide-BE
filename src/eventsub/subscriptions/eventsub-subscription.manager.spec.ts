import { Logger } from '@nestjs/common';
import type { EventSubConfig } from 'src/config/eventsub-config';
import { EventSubSubscriptionType } from 'src/eventsub/eventsub-types';
import { TEST_EVENTSUB_SECRET } from '../../../test/eventsub/eventsub-fixtures';
import { FakeTwitchHelixClient } from '../../../test/eventsub/fake-twitch-helix.client';
import {
    buildLocalEventSubConfig,
    buildTestEventSubConfig,
    TEST_CALLBACK_URL,
} from '../../../test/eventsub/test-eventsub-config';
import { EventSubSubscriptionManager } from './eventsub-subscription.manager';

const REDEMPTION = EventSubSubscriptionType.redemptionAdd;
const STREAM_ONLINE = EventSubSubscriptionType.streamOnline;
const HOUR_MS = 3_600_000;

describe('EventSubSubscriptionManager', () => {
    let helix: FakeTwitchHelixClient;
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;
    let debug: jest.SpyInstance;
    let managers: EventSubSubscriptionManager[];

    function createManager(
        config: EventSubConfig = buildTestEventSubConfig(),
    ): EventSubSubscriptionManager {
        const manager = new EventSubSubscriptionManager(config, helix);
        managers.push(manager);
        return manager;
    }

    function listCalls(): number {
        return helix.calls.filter((call) => call.operation === 'list').length;
    }

    function messagesOf(spy: jest.SpyInstance): string[] {
        return spy.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    function allMessages(): string[] {
        return [log, warn, error, debug].flatMap(messagesOf);
    }

    beforeEach(() => {
        helix = new FakeTwitchHelixClient();
        managers = [];
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    });

    afterEach(() => {
        managers.forEach((manager) => manager.onModuleDestroy());
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe.each([
        ['disabled', (): EventSubConfig => ({ mode: 'disabled' })],
        ['local', (): EventSubConfig => buildLocalEventSubConfig()],
    ])('in %s mode', (_mode, buildConfig) => {
        it('never calls Helix and starts no timer at boot', () => {
            jest.useFakeTimers();
            const manager = createManager(buildConfig());

            manager.onApplicationBootstrap();

            expect(helix.calls).toEqual([]);
            expect(jest.getTimerCount()).toBe(0);
        });

        it('never calls Helix on demand', async () => {
            await createManager(buildConfig()).reconcile();

            expect(helix.calls).toEqual([]);
        });
    });

    it('creates both webhook subscriptions when Twitch has none', async () => {
        await createManager().reconcile();

        expect(helix.createRequests).toEqual(
            [REDEMPTION, STREAM_ONLINE].map((type) => ({
                type,
                version: '1',
                condition: { broadcaster_user_id: '11111' },
                transport: {
                    method: 'webhook',
                    callback: TEST_CALLBACK_URL,
                    secret: TEST_EVENTSUB_SECRET,
                },
            })),
        );
    });

    it('deletes stale subscriptions before creating', async () => {
        const stale = helix.seed({
            type: REDEMPTION,
            status: 'notification_failures_exceeded',
        });

        await createManager().reconcile();

        expect(helix.calls).toEqual([
            { operation: 'list' },
            { operation: 'delete', id: stale.id },
            { operation: 'create', type: REDEMPTION },
            { operation: 'create', type: STREAM_ONLINE },
        ]);
    });

    it('warns on a 409 and keeps creating the other subscriptions', async () => {
        helix.failCreate(REDEMPTION, 409);

        await expect(createManager().reconcile()).resolves.toBeUndefined();

        expect(messagesOf(warn)).toEqual([
            expect.stringContaining('already exists'),
        ]);
        expect(helix.calls).toContainEqual({
            operation: 'create',
            type: STREAM_ONLINE,
        });
    });

    it('logs the streamer scope remedy on a 403 for the redemption', async () => {
        helix.failCreate(REDEMPTION, 403);

        await createManager().reconcile();

        const [message] = messagesOf(error);
        expect(message).toContain('403');
        expect(message).toContain(
            'TWITCH_LOGIN_SCOPES=channel:read:redemptions',
        );
        expect(helix.subscriptions.map((item) => item.type)).toEqual([
            STREAM_ONLINE,
        ]);
    });

    it('logs a failed delete and still creates', async () => {
        const stale = helix.seed({ type: REDEMPTION, status: 'user_removed' });
        helix.failDelete(stale.id, 500);

        await createManager().reconcile();

        expect(messagesOf(error)).toEqual([
            expect.stringContaining('failed with status 500'),
        ]);
        expect(helix.calls.slice(-2)).toEqual([
            { operation: 'create', type: REDEMPTION },
            { operation: 'create', type: STREAM_ONLINE },
        ]);
    });

    it('rejects reconcile when the list fails, while reconcileSafely logs it', async () => {
        helix.failList(503);
        const manager = createManager();

        await expect(manager.reconcile()).rejects.toThrow(
            'failed with status 503',
        );
        await expect(manager.reconcileSafely()).resolves.toBeUndefined();

        expect(messagesOf(error)).toEqual([
            expect.stringContaining('failed with status 503'),
        ]);
    });

    it('runs a single flight with one rerun for concurrent requests', async () => {
        const manager = createManager();

        const first = manager.reconcile();
        const second = manager.reconcile();
        const third = manager.reconcile();

        expect(second).toBe(first);
        expect(third).toBe(first);
        await first;
        expect(listCalls()).toBe(2);
    });

    it('starts the boot reconcile without waiting for it', async () => {
        const manager = createManager();

        expect(manager.onApplicationBootstrap()).toBeUndefined();
        await manager.reconcile();

        expect(helix.calls[0]).toEqual({ operation: 'list' });
    });

    it('reconciles every interval until the module is destroyed', async () => {
        jest.useFakeTimers();
        const manager = createManager(
            buildTestEventSubConfig({ reconcileIntervalMs: HOUR_MS }),
        );

        manager.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(3 * HOUR_MS);
        expect(listCalls()).toBe(4);

        manager.onModuleDestroy();
        await jest.advanceTimersByTimeAsync(2 * HOUR_MS);
        expect(listCalls()).toBe(4);
    });

    it('starts no timer when the interval is zero', () => {
        jest.useFakeTimers();

        createManager(
            buildTestEventSubConfig({ reconcileIntervalMs: 0 }),
        ).onApplicationBootstrap();

        expect(jest.getTimerCount()).toBe(0);
    });

    it('logs the reconciliation summary without the secret', async () => {
        const kept = helix.seed({ type: STREAM_ONLINE });
        helix.failCreate(REDEMPTION, 400);

        await createManager().reconcile();

        const summary = messagesOf(log).find((message) =>
            message.includes('EventSub subscriptions reconciled'),
        );
        expect(summary).toContain(kept.id);
        expect(summary).toContain('enabled');
        allMessages().forEach((message) =>
            expect(message).not.toContain(TEST_EVENTSUB_SECRET),
        );
    });

    it('lists created subscriptions in the summary', async () => {
        await createManager().reconcile();

        const summary = messagesOf(log).find((message) =>
            message.includes('EventSub subscriptions reconciled'),
        );
        expect(summary).toContain('webhook_callback_verification_pending');
        expect(summary).toContain(REDEMPTION);
        expect(summary).toContain(STREAM_ONLINE);
    });
});
