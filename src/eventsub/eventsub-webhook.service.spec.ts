import { Logger } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { EventSubConfig } from 'src/config/eventsub-config';
import { EVENTSUB_HEADER } from 'src/eventsub/eventsub-headers';
import {
    AUTHORIZATION_REVOKED_STATUS,
    EventSubMessageType,
    EventSubSubscriptionType,
} from 'src/eventsub/eventsub-types';
import { EventSubWebhookService } from 'src/eventsub/eventsub-webhook.service';
import {
    CreditOutcome,
    PointsCreditService,
} from 'src/eventsub/points-credit.service';
import {
    StreamOnlineOutcome,
    StreamOnlineRecorder,
} from 'src/eventsub/stream-online.recorder';
import type { EventSubSubscriptionManager } from 'src/eventsub/subscriptions/eventsub-subscription.manager';
import { streamerLive } from 'src/push/push-events';
import type { PushService } from 'src/push/push.service';
import { FixedClock } from '../../test/auth/fixed-clock';
import {
    redemptionNotification,
    revocationMessage,
    signedEventSubRequest,
    streamOnlineNotification,
    TEST_CHALLENGE,
    TEST_EVENTSUB_SECRET,
    verificationChallenge,
} from '../../test/eventsub/eventsub-fixtures';
import type { SignedEventSubRequest } from '../../test/eventsub/eventsub-fixtures';
import {
    buildLocalEventSubConfig,
    buildTestEventSubConfig,
} from '../../test/eventsub/test-eventsub-config';

const DELIVERY_COUNTS = { targeted: 1, sent: 1, pruned: 0, failed: 0 };
const ELEVEN_MINUTES_MS = 11 * 60 * 1000;

function notification(body: Record<string, unknown>): SignedEventSubRequest {
    return signedEventSubRequest({
        messageType: EventSubMessageType.notification,
        body,
    });
}

function lowercased(headers: Record<string, string>): IncomingHttpHeaders {
    return Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [
            name.toLowerCase(),
            value,
        ]),
    );
}

async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
}

describe('EventSubWebhookService', () => {
    let clock: FixedClock;
    let credit: { credit: jest.Mock };
    let recorder: { record: jest.Mock };
    let push: { broadcast: jest.Mock };
    let subscriptions: { reconcileSafely: jest.Mock };
    let debug: jest.SpyInstance;
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    function createService(
        config: EventSubConfig = buildTestEventSubConfig(),
    ): EventSubWebhookService {
        return new EventSubWebhookService(
            config,
            clock,
            credit as unknown as PointsCreditService,
            recorder as unknown as StreamOnlineRecorder,
            push as unknown as PushService,
            subscriptions as unknown as EventSubSubscriptionManager,
        );
    }

    function deliver(
        signed: SignedEventSubRequest,
        service: EventSubWebhookService = createService(),
    ) {
        return service.handle(
            lowercased(signed.headers),
            Buffer.from(signed.body),
            JSON.parse(signed.body),
        );
    }

    function messagesOf(spy: jest.SpyInstance): string[] {
        return spy.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    function allMessages(): string {
        return [debug, log, warn, error].flatMap(messagesOf).join('\n');
    }

    function expectNoSideEffects(): void {
        expect(credit.credit).not.toHaveBeenCalled();
        expect(recorder.record).not.toHaveBeenCalled();
        expect(subscriptions.reconcileSafely).not.toHaveBeenCalled();
        expect(push.broadcast).not.toHaveBeenCalled();
    }

    beforeEach(() => {
        clock = new FixedClock(new Date());
        credit = { credit: jest.fn() };
        recorder = { record: jest.fn() };
        push = { broadcast: jest.fn().mockResolvedValue(DELIVERY_COUNTS) };
        subscriptions = {
            reconcileSafely: jest.fn().mockResolvedValue(undefined),
        };
        debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('signature gate', () => {
        it('forbids every request when EventSub is disabled, even if signed', async () => {
            const reply = await deliver(
                notification(redemptionNotification()),
                createService({ mode: 'disabled' }),
            );

            expect(reply).toEqual({ kind: 'forbidden' });
            expectNoSideEffects();
        });

        it('forbids a request without the EventSub headers', async () => {
            const signed = notification(redemptionNotification());
            const headers = lowercased(signed.headers);
            delete headers[EVENTSUB_HEADER.signature];

            const reply = await createService().handle(
                headers,
                Buffer.from(signed.body),
                JSON.parse(signed.body),
            );

            expect(reply).toEqual({ kind: 'forbidden' });
            expectNoSideEffects();
        });

        it('forbids a request signed with another secret', async () => {
            const signed = signedEventSubRequest({
                messageType: EventSubMessageType.notification,
                body: redemptionNotification(),
                secret: 'another-secret-0123456789',
            });

            expect(await deliver(signed)).toEqual({ kind: 'forbidden' });
            expectNoSideEffects();
        });

        it('forbids a request older than the replay window', async () => {
            const signed = signedEventSubRequest({
                messageType: EventSubMessageType.notification,
                body: redemptionNotification(),
                timestamp: new Date(
                    clock.now().getTime() - ELEVEN_MINUTES_MS,
                ).toISOString(),
            });

            expect(await deliver(signed)).toEqual({ kind: 'forbidden' });
            expectNoSideEffects();
        });

        it('forbids a request without a raw body', async () => {
            const signed = notification(redemptionNotification());

            const reply = await createService().handle(
                lowercased(signed.headers),
                undefined,
                JSON.parse(signed.body),
            );

            expect(reply).toEqual({ kind: 'forbidden' });
            expectNoSideEffects();
        });

        it('never logs the signature, the body or the message id of a rejected request', async () => {
            const signed = signedEventSubRequest({
                messageType: EventSubMessageType.notification,
                body: redemptionNotification(),
                secret: 'another-secret-0123456789',
            });

            await deliver(signed);

            const messages = allMessages();
            expect(messages).not.toContain(
                signed.headers[EVENTSUB_HEADER.signature],
            );
            expect(messages).not.toContain(signed.body);
            expect(messages).not.toContain(signed.messageId);
            expect(messages).not.toContain(TEST_EVENTSUB_SECRET);
        });

        it('checks the signature before answering a challenge', async () => {
            const signed = signedEventSubRequest({
                messageType: EventSubMessageType.verification,
                body: verificationChallenge(),
                secret: 'another-secret-0123456789',
            });

            expect(await deliver(signed)).toEqual({ kind: 'forbidden' });
        });
    });

    describe('callback verification', () => {
        it('answers a signed challenge with the bare challenge', async () => {
            const signed = signedEventSubRequest({
                messageType: EventSubMessageType.verification,
                body: verificationChallenge(),
            });

            expect(await deliver(signed)).toEqual({
                kind: 'challenge',
                challenge: TEST_CHALLENGE,
            });
        });

        it('forbids a signed verification without a challenge', async () => {
            const signed = signedEventSubRequest({
                messageType: EventSubMessageType.verification,
                body: { subscription: { id: 'sub-1' } },
            });

            expect(await deliver(signed)).toEqual({ kind: 'forbidden' });
        });
    });

    describe('in local mode', () => {
        it('answers the challenge and credits a redemption as in managed mode', async () => {
            credit.credit.mockResolvedValue(CreditOutcome.credited);
            const service = createService(buildLocalEventSubConfig());

            const challenge = await deliver(
                signedEventSubRequest({
                    messageType: EventSubMessageType.verification,
                    body: verificationChallenge(),
                }),
                service,
            );
            const redemption = await deliver(
                notification(redemptionNotification()),
                service,
            );

            expect(challenge).toEqual({
                kind: 'challenge',
                challenge: TEST_CHALLENGE,
            });
            expect(redemption).toEqual({ kind: 'noContent' });
            expect(credit.credit).toHaveBeenCalledTimes(1);
        });
    });

    describe('revocation', () => {
        function revocation(body: Record<string, unknown>) {
            return signedEventSubRequest({
                messageType: EventSubMessageType.revocation,
                body,
            });
        }

        it('logs the remedy and reconciles when the redemption authorization is revoked', async () => {
            const reply = await deliver(
                revocation(
                    revocationMessage(
                        EventSubSubscriptionType.redemptionAdd,
                        AUTHORIZATION_REVOKED_STATUS,
                    ),
                ),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(subscriptions.reconcileSafely).toHaveBeenCalledTimes(1);
            expect(error).toHaveBeenCalledTimes(1);
            const message = messagesOf(error)[0];
            expect(message).toContain(EventSubSubscriptionType.redemptionAdd);
            expect(message).toContain(AUTHORIZATION_REVOKED_STATUS);
            expect(message).toContain(
                'TWITCH_LOGIN_SCOPES=channel:read:redemptions',
            );
        });

        it('logs the revocation without the remedy for another status', async () => {
            await deliver(
                revocation(
                    revocationMessage(
                        EventSubSubscriptionType.redemptionAdd,
                        'user_removed',
                    ),
                ),
            );

            const message = messagesOf(error)[0];
            expect(message).toContain('user_removed');
            expect(message).not.toContain('TWITCH_LOGIN_SCOPES');
            expect(subscriptions.reconcileSafely).toHaveBeenCalledTimes(1);
        });

        it('warns and still reconciles on a malformed revocation', async () => {
            const reply = await deliver(revocation({ subscription: {} }));

            expect(reply).toEqual({ kind: 'noContent' });
            expect(warn).toHaveBeenCalledTimes(1);
            expect(subscriptions.reconcileSafely).toHaveBeenCalledTimes(1);
        });

        it('answers without waiting for the reconcile', async () => {
            subscriptions.reconcileSafely.mockReturnValue(
                new Promise(() => undefined),
            );

            const reply = await deliver(
                revocation(
                    revocationMessage(
                        EventSubSubscriptionType.streamOnline,
                        'user_removed',
                    ),
                ),
            );

            expect(reply).toEqual({ kind: 'noContent' });
        });
    });

    describe('unknown messages', () => {
        it('ignores a signed message of unknown type', async () => {
            const reply = await deliver(
                signedEventSubRequest({
                    messageType: 'mystery',
                    body: redemptionNotification(),
                }),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(warn).toHaveBeenCalledTimes(1);
            expectNoSideEffects();
        });

        it('ignores a notification of an unsupported subscription type', async () => {
            const reply = await deliver(
                notification({
                    subscription: { id: 'sub-1', type: 'stream.offline' },
                    event: { broadcaster_user_id: '11111' },
                }),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(messagesOf(warn).join('\n')).toContain('stream.offline');
            expectNoSideEffects();
        });
    });

    describe('redemption', () => {
        it('ignores a redemption of another channel', async () => {
            const reply = await deliver(
                notification(
                    redemptionNotification({ broadcasterUserId: '99999' }),
                ),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(warn).toHaveBeenCalledTimes(1);
            expect(credit.credit).not.toHaveBeenCalled();
        });

        it('rejects a malformed redemption without credit', async () => {
            const reply = await deliver(
                notification(redemptionNotification({ cost: 0 })),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(error).toHaveBeenCalledTimes(1);
            expect(credit.credit).not.toHaveBeenCalled();
        });

        it('credits a redemption of the configured channel', async () => {
            credit.credit.mockResolvedValue(CreditOutcome.credited);
            const signed = notification(redemptionNotification());

            const reply = await deliver(signed);

            expect(reply).toEqual({ kind: 'noContent' });
            expect(credit.credit).toHaveBeenCalledWith(
                {
                    id: 'redemption-1',
                    broadcasterUserId: '11111',
                    userId: '22222',
                    rewardId: 'reward-1',
                    cost: 250,
                },
                signed.messageId,
                clock.now(),
            );
            const credited = messagesOf(log).find((message) =>
                message.includes(signed.messageId),
            );
            expect(credited).toContain('250');
            expect(credited).toContain('22222');
        });

        it('answers silently on a duplicate delivery', async () => {
            credit.credit.mockResolvedValue(CreditOutcome.duplicate);

            const reply = await deliver(notification(redemptionNotification()));

            expect(reply).toEqual({ kind: 'noContent' });
            expect(warn).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        });

        it('logs nothing above debug for a viewer without an account', async () => {
            credit.credit.mockResolvedValue(CreditOutcome.unknownViewer);

            const reply = await deliver(notification(redemptionNotification()));

            expect(reply).toEqual({ kind: 'noContent' });
            expect(log).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
            expect(debug).toHaveBeenCalled();
        });

        it('asks Twitch to retry on a database error without leaking its message', async () => {
            credit.credit.mockRejectedValue(
                Object.assign(new Error('E11000 secret'), {
                    name: 'MongoServerError',
                    code: 91,
                }),
            );

            const reply = await deliver(notification(redemptionNotification()));

            expect(reply).toEqual({ kind: 'retryLater' });
            const messages = messagesOf(error).join('\n');
            expect(messages).toContain('MongoServerError, code 91');
            expect(allMessages()).not.toContain('E11000 secret');
        });
    });

    describe('stream.online', () => {
        it('broadcasts the streamer-live push once the event is recorded', async () => {
            recorder.record.mockResolvedValue(StreamOnlineOutcome.recorded);

            const reply = await deliver(
                notification(streamOnlineNotification()),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(push.broadcast).toHaveBeenCalledTimes(1);
            expect(push.broadcast).toHaveBeenCalledWith(streamerLive());
        });

        it('broadcasts for any stream type, not only live', async () => {
            recorder.record.mockResolvedValue(StreamOnlineOutcome.recorded);

            await deliver(
                notification(streamOnlineNotification({ type: 'rerun' })),
            );

            expect(push.broadcast).toHaveBeenCalledTimes(1);
        });

        it('answers without waiting for the broadcast', async () => {
            recorder.record.mockResolvedValue(StreamOnlineOutcome.recorded);
            push.broadcast.mockReturnValue(new Promise(() => undefined));

            const reply = await deliver(
                notification(streamOnlineNotification()),
            );

            expect(reply).toEqual({ kind: 'noContent' });
        });

        it('does not broadcast twice on a duplicate delivery', async () => {
            recorder.record.mockResolvedValue(StreamOnlineOutcome.duplicate);

            const reply = await deliver(
                notification(streamOnlineNotification()),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(push.broadcast).not.toHaveBeenCalled();
        });

        it('asks Twitch to retry and does not broadcast when recording fails', async () => {
            recorder.record.mockRejectedValue(
                Object.assign(new Error('boom'), {
                    name: 'MongoServerError',
                    code: 91,
                }),
            );

            const reply = await deliver(
                notification(streamOnlineNotification()),
            );

            expect(reply).toEqual({ kind: 'retryLater' });
            expect(push.broadcast).not.toHaveBeenCalled();
        });

        it('swallows a rejected broadcast', async () => {
            recorder.record.mockResolvedValue(StreamOnlineOutcome.recorded);
            push.broadcast.mockRejectedValue(new Error('fcm down'));

            const reply = await deliver(
                notification(streamOnlineNotification()),
            );
            await flushMicrotasks();

            expect(reply).toEqual({ kind: 'noContent' });
            expect(messagesOf(warn).join('\n')).toContain(
                'streamer-live push not sent',
            );
        });

        it('ignores a stream.online of another channel', async () => {
            const reply = await deliver(
                notification(
                    streamOnlineNotification({ broadcasterUserId: '99999' }),
                ),
            );

            expect(reply).toEqual({ kind: 'noContent' });
            expect(recorder.record).not.toHaveBeenCalled();
            expect(push.broadcast).not.toHaveBeenCalled();
        });
    });

    it('never throws on an unexpected error while parsing', async () => {
        const signed = notification(redemptionNotification());
        const body = {
            get subscription(): unknown {
                throw new Error('getter exploded');
            },
        };

        const reply = await createService().handle(
            lowercased(signed.headers),
            Buffer.from(signed.body),
            body,
        );

        expect(reply).toEqual({ kind: 'retryLater' });
        expect(error).toHaveBeenCalledTimes(1);
    });
});
