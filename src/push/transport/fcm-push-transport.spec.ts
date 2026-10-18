import { Logger } from '@nestjs/common';
import { deleteApp, getApps } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';
import { generateKeyPairSync } from 'node:crypto';
import { Clock } from 'src/auth/clock';
import type { FirebaseServiceAccount } from 'src/config/push-config';
import { PUSH_CONFIG } from 'src/config/push-config';
import { streamerLive, travelEnd } from 'src/push/push-events';
import { STREAMER_LIVE_TOPIC } from 'src/push/push-message';
import { toFcmBase } from 'src/push/transport/fcm-message';
import {
    FCM_APP_NAME,
    FcmPushTransport,
} from 'src/push/transport/fcm-push-transport';
import { NoopPushTransport } from 'src/push/transport/noop-push-transport';
import { pushTransportProvider } from 'src/push/transport/push-transport.provider';
import { FixedClock } from '../../../test/auth/fixed-clock';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function generatedServiceAccount(): FirebaseServiceAccount {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    return {
        projectId: 'klimmeck-test',
        clientEmail: 'push@klimmeck-test.iam.gserviceaccount.com',
        privateKey,
    };
}

function fcmError(code: string): Error {
    return Object.assign(new Error(code), { code });
}

describe('FcmPushTransport', () => {
    let messaging: {
        sendEachForMulticast: jest.Mock;
        send: jest.Mock;
        subscribeToTopic: jest.Mock;
        unsubscribeFromTopic: jest.Mock;
    };
    let transport: FcmPushTransport;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        messaging = {
            sendEachForMulticast: jest.fn(),
            send: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };
        transport = new FcmPushTransport(
            messaging as unknown as Messaging,
            new FixedClock(NOW),
        );
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    describe('sendToTokens', () => {
        const message = travelEnd('c1');

        it('maps each FCM response to its token by index', async () => {
            messaging.sendEachForMulticast.mockResolvedValue({
                responses: [
                    { success: true, messageId: 'm1' },
                    {
                        success: false,
                        error: {
                            code: 'messaging/registration-token-not-registered',
                        },
                    },
                ],
                successCount: 1,
                failureCount: 1,
            });

            await expect(
                transport.sendToTokens(['t1', 't2'], message),
            ).resolves.toEqual([
                { token: 't1', delivered: true, errorCode: undefined },
                {
                    token: 't2',
                    delivered: false,
                    errorCode: 'messaging/registration-token-not-registered',
                },
            ]);
            expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
            expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
                tokens: ['t1', 't2'],
                ...toFcmBase(message, NOW),
            });
        });

        it('fails every token with the code of a rejected call', async () => {
            messaging.sendEachForMulticast.mockRejectedValue(
                fcmError('messaging/third-party-auth-error'),
            );

            await expect(
                transport.sendToTokens(['t1', 't2'], message),
            ).resolves.toEqual([
                {
                    token: 't1',
                    delivered: false,
                    errorCode: 'messaging/third-party-auth-error',
                },
                {
                    token: 't2',
                    delivered: false,
                    errorCode: 'messaging/third-party-auth-error',
                },
            ]);
        });

        it('falls back to transport-error when the rejection has no string code', async () => {
            messaging.sendEachForMulticast.mockRejectedValue(new Error('x'));

            await expect(
                transport.sendToTokens(['t1'], message),
            ).resolves.toEqual([
                { token: 't1', delivered: false, errorCode: 'transport-error' },
            ]);
        });

        it('never throws when the SDK throws synchronously', async () => {
            messaging.sendEachForMulticast.mockImplementation(() => {
                throw fcmError('messaging/invalid-argument');
            });

            await expect(
                transport.sendToTokens(['t1', 't2'], message),
            ).resolves.toEqual([
                {
                    token: 't1',
                    delivered: false,
                    errorCode: 'messaging/invalid-argument',
                },
                {
                    token: 't2',
                    delivered: false,
                    errorCode: 'messaging/invalid-argument',
                },
            ]);
        });
    });

    describe('sendToTopic', () => {
        it('reports a delivered topic send', async () => {
            messaging.send.mockResolvedValue('projects/p/messages/1');

            await expect(
                transport.sendToTopic(STREAMER_LIVE_TOPIC, streamerLive()),
            ).resolves.toEqual({ delivered: true });
            expect(messaging.send).toHaveBeenCalledWith({
                topic: 'streamer-live',
                ...toFcmBase(streamerLive(), NOW),
            });
        });

        it('reports the code of a rejected topic send', async () => {
            messaging.send.mockRejectedValue(
                fcmError('messaging/server-unavailable'),
            );

            await expect(
                transport.sendToTopic(STREAMER_LIVE_TOPIC, streamerLive()),
            ).resolves.toEqual({
                delivered: false,
                errorCode: 'messaging/server-unavailable',
            });
        });
    });

    describe.each([
        ['subscribeToTopic', 'subscribeToTopic'] as const,
        ['unsubscribeFromTopic', 'unsubscribeFromTopic'] as const,
    ])('%s', (_title, operation) => {
        const tokens = ['token-ok-secret', 'token-bad-secret'];

        it('resolves and warns with the failure codes only, never the tokens', async () => {
            messaging[operation].mockResolvedValue({
                successCount: 1,
                failureCount: 1,
                errors: [
                    {
                        index: 1,
                        error: { code: 'messaging/invalid-registration-token' },
                    },
                ],
            });

            await expect(
                transport[operation](tokens, STREAMER_LIVE_TOPIC),
            ).resolves.toBeUndefined();
            expect(messaging[operation]).toHaveBeenCalledWith(
                tokens,
                STREAMER_LIVE_TOPIC,
            );
            expect(warn).toHaveBeenCalledTimes(1);
            const logged = String(warn.mock.calls[0][0]);
            expect(logged).toContain('messaging/invalid-registration-token');
            for (const token of tokens) {
                expect(logged).not.toContain(token);
            }
        });

        it('does not warn when every token succeeds', async () => {
            messaging[operation].mockResolvedValue({
                successCount: 2,
                failureCount: 0,
                errors: [],
            });

            await transport[operation](tokens, STREAMER_LIVE_TOPIC);

            expect(warn).not.toHaveBeenCalled();
        });

        it('rejects when the whole call fails', async () => {
            messaging[operation].mockRejectedValue(
                fcmError('messaging/server-unavailable'),
            );

            await expect(
                transport[operation](tokens, STREAMER_LIVE_TOPIC),
            ).rejects.toThrow('messaging/server-unavailable');
        });
    });
});

describe('FcmPushTransport.connect and pushTransportProvider (offline)', () => {
    const clock = new FixedClock(NOW);
    const account = generatedServiceAccount();

    afterAll(async () => {
        const app = getApps().find(
            (candidate) => candidate.name === FCM_APP_NAME,
        );
        if (app) await deleteApp(app);
    });

    it('connects an enabled transport without any network call', () => {
        const transport = FcmPushTransport.connect(account, clock);

        expect(transport).toBeInstanceOf(FcmPushTransport);
        expect(transport.enabled).toBe(true);
    });

    it('reuses the named app on a second connect', () => {
        expect(() => FcmPushTransport.connect(account, clock)).not.toThrow();
        expect(
            getApps().filter((candidate) => candidate.name === FCM_APP_NAME),
        ).toHaveLength(1);
    });

    it('provides the no-op transport when the service account is missing', () => {
        expect(
            pushTransportProvider.useFactory({ serviceAccount: null }, clock),
        ).toBeInstanceOf(NoopPushTransport);
    });

    it('provides the FCM transport when the service account is present', () => {
        expect(
            pushTransportProvider.useFactory(
                { serviceAccount: account },
                clock,
            ),
        ).toBeInstanceOf(FcmPushTransport);
    });

    it('injects the push config and the clock', () => {
        expect(pushTransportProvider.inject).toEqual([PUSH_CONFIG, Clock]);
    });
});
