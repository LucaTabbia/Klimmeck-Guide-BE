import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { UserDocument } from 'src/models/user.model';
import {
    DeviceRegistration,
    PushDeviceRegistry,
} from 'src/push/push-device.registry';
import { streamerLive, testPushMessage, travelEnd } from 'src/push/push-events';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushService } from 'src/push/push.service';
import { FixedClock } from '../../test/auth/fixed-clock';
import { FakePushTransport } from '../../test/push/fake-push-transport';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const ALICE_ID = '64b0000000000000000000a1';
const ALICE = new Types.ObjectId(ALICE_ID);
const BRUNO_ID = '64b0000000000000000000b2';
const MISSING_USER_ID = '64b0000000000000000000ff';
const STREAMER_LIVE = 'streamer-live';
const EMPTY = { targeted: 0, sent: 0, pruned: 0, failed: 0 };

interface StoredDevice {
    userId: string;
    deviceId: string;
    token: string;
}

class InMemoryPushDeviceRegistry {
    rows: StoredDevice[] = [];

    claim = jest.fn(
        (registration: DeviceRegistration): Promise<string | null> => {
            const userId = String(registration.userId);
            const { deviceId, token } = registration;
            this.rows = this.rows.filter(
                (row) =>
                    row.token !== token ||
                    (row.userId === userId && row.deviceId === deviceId),
            );
            const existing = this.rows.find(
                (row) => row.userId === userId && row.deviceId === deviceId,
            );
            const previous = existing?.token ?? null;
            if (existing) existing.token = token;
            else this.rows.push({ userId, deviceId, token });
            return Promise.resolve(previous);
        },
    );

    unregister = jest.fn(
        (userId: Types.ObjectId, deviceId: string): Promise<string | null> => {
            const row = this.rows.find(
                (candidate) =>
                    candidate.userId === String(userId) &&
                    candidate.deviceId === deviceId,
            );
            if (!row) return Promise.resolve(null);
            this.rows = this.rows.filter((candidate) => candidate !== row);
            return Promise.resolve(row.token);
        },
    );

    tokensOf = jest.fn(
        (userId: Types.ObjectId): Promise<string[]> =>
            Promise.resolve(
                this.rows
                    .filter((row) => row.userId === String(userId))
                    .map((row) => row.token),
            ),
    );

    removeTokens = jest.fn((tokens: string[]): Promise<number> => {
        const before = this.rows.length;
        this.rows = this.rows.filter((row) => !tokens.includes(row.token));
        return Promise.resolve(before - this.rows.length);
    });

    seed(userId: string, ...tokens: string[]): void {
        tokens.forEach((token, index) =>
            this.rows.push({ userId, deviceId: `dev-${index}`, token }),
        );
    }
}

describe('PushService', () => {
    let registry: InMemoryPushDeviceRegistry;
    let transport: FakePushTransport;
    let users: { exists: jest.Mock };
    let service: PushService;
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        registry = new InMemoryPushDeviceRegistry();
        transport = new FakePushTransport();
        users = { exists: jest.fn() };
        service = new PushService(
            registry as unknown as PushDeviceRegistry,
            transport,
            new FixedClock(NOW),
            users as unknown as Model<UserDocument>,
        );
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    afterEach(() => jest.restoreAllMocks());

    const loggedLines = (spy: jest.SpyInstance): string[] =>
        spy.mock.calls.map((call: unknown[]) => String(call[0]));

    describe('sendToUser', () => {
        it('returns an empty report for a user without devices', async () => {
            await expect(
                service.sendToUser(ALICE, travelEnd('c1')),
            ).resolves.toEqual(EMPTY);
            expect(transport.sent).toEqual([]);
        });

        it('sends to every device of the user', async () => {
            registry.seed(ALICE_ID, 't1', 't2');

            const report = await service.sendToUser(ALICE, travelEnd('c1'));

            expect(transport.sent[0]).toEqual({
                tokens: ['t1', 't2'],
                message: travelEnd('c1'),
            });
            expect(report).toEqual({
                targeted: 2,
                sent: 2,
                pruned: 0,
                failed: 0,
            });
        });

        it('prunes a token FCM no longer recognises', async () => {
            registry.seed(ALICE_ID, 't1', 't2');
            transport.failToken(
                't2',
                'messaging/registration-token-not-registered',
            );

            const report = await service.sendToUser(ALICE, travelEnd('c1'));

            expect(report).toEqual({
                targeted: 2,
                sent: 1,
                pruned: 1,
                failed: 1,
            });
            await expect(registry.tokensOf(ALICE)).resolves.toEqual(['t1']);
            const lines = loggedLines(log);
            expect(lines.some((line) => line.includes('pruned 1'))).toBe(true);
            expect(lines.some((line) => line.includes('t2'))).toBe(false);
        });

        it('prunes invalid-argument when another token of the batch was delivered', async () => {
            registry.seed(ALICE_ID, 't1', 't2');
            transport.failToken('t2', 'messaging/invalid-argument');

            const report = await service.sendToUser(ALICE, travelEnd('c1'));

            expect(report.pruned).toBe(1);
            await expect(registry.tokensOf(ALICE)).resolves.toEqual(['t1']);
        });

        it('never prunes invalid-argument without a delivered witness', async () => {
            registry.seed(ALICE_ID, 't1', 't2');
            transport.failToken('t1', 'messaging/invalid-argument');
            transport.failToken('t2', 'messaging/invalid-argument');

            const report = await service.sendToUser(ALICE, travelEnd('c1'));

            expect(report).toEqual({
                targeted: 2,
                sent: 0,
                pruned: 0,
                failed: 2,
            });
            expect(registry.removeTokens).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledTimes(1);
        });

        it('keeps tokens that failed transiently and warns with the codes', async () => {
            registry.seed(ALICE_ID, 't1', 't2');
            transport.failToken('t1', 'messaging/server-unavailable');
            transport.failToken('t2', 'messaging/message-rate-exceeded');

            const report = await service.sendToUser(ALICE, travelEnd('c1'));

            expect(report.pruned).toBe(0);
            expect(
                loggedLines(warn).some(
                    (line) =>
                        line.includes('messaging/server-unavailable') &&
                        line.includes('messaging/message-rate-exceeded'),
                ),
            ).toBe(true);
        });

        it('sends in batches of 500 tokens', async () => {
            const tokens = Array.from(
                { length: 1001 },
                (_, index) => `t${index}`,
            );
            registry.seed(ALICE_ID, ...tokens);

            const report = await service.sendToUser(ALICE, travelEnd('c1'));

            expect(transport.sent.map((call) => call.tokens.length)).toEqual([
                500, 500, 1,
            ]);
            expect(report.targeted).toBe(1001);
        });

        it('never throws when the registry fails', async () => {
            registry.tokensOf.mockRejectedValueOnce(new Error('mongo down'));

            await expect(
                service.sendToUser(ALICE, travelEnd('c1')),
            ).resolves.toEqual(EMPTY);
            expect(warn).toHaveBeenCalled();
        });

        it('does nothing when push is disabled', async () => {
            transport.enabled = false;
            registry.seed(ALICE_ID, 't1');

            await expect(
                service.sendToUser(ALICE, travelEnd('c1')),
            ).resolves.toEqual(EMPTY);
            expect(registry.tokensOf).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        });
    });

    describe('broadcast', () => {
        it('sends to the streamer-live topic', async () => {
            const report = await service.broadcast(streamerLive());

            expect(transport.topicSends).toEqual([
                { topic: 'streamer-live', message: streamerLive() },
            ]);
            expect(report).toEqual({
                targeted: 1,
                sent: 1,
                pruned: 0,
                failed: 0,
            });
        });

        it('reports and warns about an undelivered topic send', async () => {
            transport.failTopicSend('messaging/server-unavailable');

            const report = await service.broadcast(streamerLive());

            expect(report).toEqual({
                targeted: 1,
                sent: 0,
                pruned: 0,
                failed: 1,
            });
            expect(
                loggedLines(warn).some((line) =>
                    line.includes('messaging/server-unavailable'),
                ),
            ).toBe(true);
        });

        it('never throws when the transport rejects', async () => {
            jest.spyOn(transport, 'sendToTopic').mockRejectedValue(
                new Error('boom'),
            );

            await expect(service.broadcast(streamerLive())).resolves.toEqual({
                targeted: 1,
                sent: 0,
                pruned: 0,
                failed: 1,
            });
        });

        it('does nothing when push is disabled', async () => {
            transport.enabled = false;

            await expect(service.broadcast(streamerLive())).resolves.toEqual(
                EMPTY,
            );
            expect(transport.topicSends).toEqual([]);
        });
    });
    const userExists = (value: unknown) =>
        users.exists.mockReturnValue({ exec: () => Promise.resolve(value) });

    const registration = (token = 'tok-a', deviceId = 'dev-1') => ({
        deviceId,
        token,
        platform: PushPlatform.android,
    });

    describe('registerDevice', () => {
        beforeEach(() => userExists({ _id: ALICE }));

        it('claims the device and subscribes its token to the streamer-live topic', async () => {
            await expect(
                service.registerDevice(ALICE_ID, registration()),
            ).resolves.toBe(true);

            expect(registry.claim).toHaveBeenCalledWith(
                {
                    userId: new Types.ObjectId(ALICE_ID),
                    deviceId: 'dev-1',
                    token: 'tok-a',
                    platform: 'android',
                },
                NOW,
            );
            expect(transport.subscriptions).toEqual([
                { tokens: ['tok-a'], topic: STREAMER_LIVE },
            ]);
        });

        it('rejects an invalid device id before any I/O', async () => {
            await expect(
                service.registerDevice(
                    ALICE_ID,
                    registration('tok-a', 'bad id'),
                ),
            ).rejects.toMatchObject({ code: 'PUSH_INVALID_DEVICE_ID' });
            expect(users.exists).not.toHaveBeenCalled();
            expect(registry.claim).not.toHaveBeenCalled();
        });

        it('rejects an invalid token', async () => {
            await expect(
                service.registerDevice(ALICE_ID, registration('tok a')),
            ).rejects.toMatchObject({ code: 'PUSH_INVALID_TOKEN' });
        });

        it('rejects a bearer whose user no longer exists', async () => {
            userExists(null);

            await expect(
                service.registerDevice(ALICE_ID, registration()),
            ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
            expect(registry.claim).not.toHaveBeenCalled();
        });

        it('rejects a non hexadecimal user id', async () => {
            await expect(
                service.registerDevice('not-an-id', registration()),
            ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
            expect(registry.claim).not.toHaveBeenCalled();
        });

        it('registers anyway when the topic subscription fails', async () => {
            transport.failTopicManagement(new Error('boom'));

            await expect(
                service.registerDevice(ALICE_ID, registration()),
            ).resolves.toBe(true);
            expect(registry.rows).toEqual([
                { userId: ALICE_ID, deviceId: 'dev-1', token: 'tok-a' },
            ]);
            expect(warn).toHaveBeenCalled();
            expect(
                loggedLines(warn).some((line) => line.includes('tok-a')),
            ).toBe(false);
        });

        it('unsubscribes the previous token when the device rotates it', async () => {
            await service.registerDevice(ALICE_ID, registration('tok-a'));
            await service.registerDevice(ALICE_ID, registration('tok-b'));

            expect(transport.unsubscriptions).toEqual([
                { tokens: ['tok-a'], topic: STREAMER_LIVE },
            ]);
        });

        it('does not unsubscribe when the same token is registered again', async () => {
            await service.registerDevice(ALICE_ID, registration('tok-a'));
            await service.registerDevice(ALICE_ID, registration('tok-a'));

            expect(transport.unsubscriptions).toEqual([]);
        });
    });

    describe('unregisterDevice', () => {
        beforeEach(() => userExists({ _id: ALICE }));

        it('removes the device and unsubscribes its token', async () => {
            await service.registerDevice(ALICE_ID, registration());

            await expect(
                service.unregisterDevice(ALICE_ID, 'dev-1'),
            ).resolves.toBe(true);
            expect(registry.rows).toEqual([]);
            expect(transport.unsubscriptions).toEqual([
                { tokens: ['tok-a'], topic: STREAMER_LIVE },
            ]);
        });

        it('is idempotent for an unknown device', async () => {
            await expect(
                service.unregisterDevice(ALICE_ID, 'dev-1'),
            ).resolves.toBe(true);
            expect(transport.unsubscriptions).toEqual([]);
        });

        it('rejects an invalid device id', async () => {
            await expect(
                service.unregisterDevice(ALICE_ID, 'bad id'),
            ).rejects.toMatchObject({ code: 'PUSH_INVALID_DEVICE_ID' });
        });
    });

    describe('sendTest', () => {
        it('rejects with PUSH_DISABLED when push is not configured', async () => {
            transport.enabled = false;

            await expect(
                service.sendTest(ALICE_ID, { type: PushEventType.travelEnd }),
            ).rejects.toMatchObject({ code: 'PUSH_DISABLED' });
            await expect(
                service.sendTest(ALICE_ID, {
                    type: PushEventType.streamerLive,
                }),
            ).rejects.toMatchObject({ code: 'PUSH_DISABLED' });
        });

        it('broadcasts streamerLive ignoring the target user', async () => {
            const report = await service.sendTest(ALICE_ID, {
                type: PushEventType.streamerLive,
                targetUserId: 'nope',
            });

            expect(transport.topicSends).toHaveLength(1);
            expect(transport.topicSends[0].message).toEqual(streamerLive());
            expect(users.exists).not.toHaveBeenCalled();
            expect(report).toEqual({
                targeted: 1,
                sent: 1,
                pruned: 0,
                failed: 0,
            });
        });

        it('targets the caller when no target user is given', async () => {
            userExists({ _id: ALICE });
            registry.seed(ALICE_ID, 'tok-a');

            await service.sendTest(ALICE_ID, {
                type: PushEventType.travelEnd,
                id: 'c1',
            });

            expect(transport.sent[0]).toEqual({
                tokens: ['tok-a'],
                message: testPushMessage(PushEventType.travelEnd, 'c1'),
            });
        });

        it('sends to the requested target user', async () => {
            userExists({ _id: new Types.ObjectId(BRUNO_ID) });
            registry.seed(ALICE_ID, 'tok-a');
            registry.seed(BRUNO_ID, 'tok-b');

            await service.sendTest(ALICE_ID, {
                type: PushEventType.questEnd,
                targetUserId: BRUNO_ID,
            });

            expect(transport.sent.map((call) => call.tokens)).toEqual([
                ['tok-b'],
            ]);
        });

        it('rejects with NOT_FOUND for a missing target user', async () => {
            userExists(null);

            await expect(
                service.sendTest(ALICE_ID, {
                    type: PushEventType.questEnd,
                    targetUserId: MISSING_USER_ID,
                }),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        });

        it('rejects with NOT_FOUND for a malformed target user without querying', async () => {
            await expect(
                service.sendTest(ALICE_ID, {
                    type: PushEventType.questEnd,
                    targetUserId: 'nope',
                }),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(users.exists).not.toHaveBeenCalled();
        });
    });
});
