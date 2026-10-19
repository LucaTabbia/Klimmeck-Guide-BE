import { HttpStatus } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
    EventSubMessage,
    EventSubMessageDocument,
} from 'src/eventsub/eventsub-message.model';
import {
    AUTHORIZATION_REVOKED_STATUS,
    EventSubMessageType,
    EventSubSubscriptionType,
} from 'src/eventsub/eventsub-types';
import { User, UserDocument } from 'src/models/user.model';
import { PushEventType } from 'src/push/push-event-type.enum';
import {
    redemptionNotification,
    revocationMessage,
    signedEventSubRequest,
    streamOnlineNotification,
    TEST_VIEWER_TWITCH_ID,
} from '../../test/eventsub/eventsub-fixtures';
import type {
    RedemptionOverrides,
    SignedEventSubRequest,
} from '../../test/eventsub/eventsub-fixtures';
import {
    createEventSubTestApp,
    EventSubTestApp,
    postEventSub,
} from '../../test/eventsub/eventsub-test-app';
import { persistUser } from '../../test/fixtures/user.fixture';

const STARTING_POINTS = 100;
const REWARD_COST = 250;
const CREDITED_POINTS = STARTING_POINTS + REWARD_COST;
const CONCURRENT_DELIVERIES = 5;
const UNKNOWN_TWITCH_ID = '99999';
const PUSH_WAIT_TIMEOUT_MS = 1000;
const PUSH_WAIT_STEP_MS = 10;

const signedRedemption = (
    overrides: RedemptionOverrides = {},
    messageId?: string,
): SignedEventSubRequest =>
    signedEventSubRequest({
        messageType: EventSubMessageType.notification,
        body: redemptionNotification(overrides),
        messageId,
    });

const signedStreamOnline = (messageId?: string): SignedEventSubRequest =>
    signedEventSubRequest({
        messageType: EventSubMessageType.notification,
        body: streamOnlineNotification(),
        messageId,
    });

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

describe('EventSub points and streamer live (wire, replSet)', () => {
    let harness: EventSubTestApp;
    let messages: Model<EventSubMessageDocument>;
    let users: Model<UserDocument>;

    beforeAll(async () => {
        harness = await createEventSubTestApp();
        messages = harness.connection.model<EventSubMessageDocument>(
            EventSubMessage.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        // collection e indici unici pronti prima delle gare (Pitfall 5)
        await Promise.all([messages.init(), users.init()]);
    });

    beforeEach(async () => {
        await persistUser(users, {
            twitchId: TEST_VIEWER_TWITCH_ID,
            twitchPoints: STARTING_POINTS,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
        harness.push.reset();
        harness.helix.clearCalls();
    });

    afterAll(() => harness.close());

    async function pointsOfViewer(): Promise<number | undefined> {
        const user = await users
            .findOne({ twitchId: TEST_VIEWER_TWITCH_ID }, { twitchPoints: 1 })
            .lean<{ twitchPoints: number } | null>()
            .exec();
        return user?.twitchPoints;
    }

    async function waitForTopicSends(count: number): Promise<void> {
        const deadline = Date.now() + PUSH_WAIT_TIMEOUT_MS;
        while (harness.push.topicSends.length < count) {
            if (Date.now() > deadline) return;
            await sleep(PUSH_WAIT_STEP_MS);
        }
    }

    async function post(signed: SignedEventSubRequest): Promise<number> {
        const response = await postEventSub(harness.app, signed);
        return response.status;
    }

    it('credits the reward cost once and records the message', async () => {
        await expect(post(signedRedemption())).resolves.toBe(
            HttpStatus.NO_CONTENT,
        );

        await expect(pointsOfViewer()).resolves.toBe(CREDITED_POINTS);
        await expect(messages.find().lean().exec()).resolves.toEqual([
            expect.objectContaining({
                outcome: 'credited',
                amount: REWARD_COST,
                twitchUserId: TEST_VIEWER_TWITCH_ID,
                eventId: 'redemption-1',
            }),
        ]);
    });

    it('does not credit a redelivered message twice', async () => {
        const signed = signedRedemption();

        await expect(post(signed)).resolves.toBe(HttpStatus.NO_CONTENT);
        await expect(post(signed)).resolves.toBe(HttpStatus.NO_CONTENT);

        await expect(pointsOfViewer()).resolves.toBe(CREDITED_POINTS);
        await expect(messages.countDocuments()).resolves.toBe(1);
    });

    it('credits once across concurrent deliveries of the same message', async () => {
        const signed = signedRedemption();

        const statuses = await Promise.all(
            Array.from({ length: CONCURRENT_DELIVERIES }, () => post(signed)),
        );

        expect(statuses).toEqual(
            Array(CONCURRENT_DELIVERIES).fill(HttpStatus.NO_CONTENT),
        );
        await expect(pointsOfViewer()).resolves.toBe(CREDITED_POINTS);
        await expect(messages.countDocuments()).resolves.toBe(1);
    });

    it('credits once when the same redemption arrives under two message ids', async () => {
        await expect(post(signedRedemption({}, 'message-a'))).resolves.toBe(
            HttpStatus.NO_CONTENT,
        );
        await expect(post(signedRedemption({}, 'message-b'))).resolves.toBe(
            HttpStatus.NO_CONTENT,
        );

        await expect(pointsOfViewer()).resolves.toBe(CREDITED_POINTS);
        await expect(messages.countDocuments()).resolves.toBe(1);
    });

    it('ignores a viewer without an account without creating one', async () => {
        const usersBefore = await users.countDocuments();

        await expect(
            post(signedRedemption({ userId: UNKNOWN_TWITCH_ID })),
        ).resolves.toBe(HttpStatus.NO_CONTENT);

        await expect(messages.countDocuments()).resolves.toBe(0);
        await expect(users.countDocuments()).resolves.toBe(usersBefore);
    });

    it('ignores a redemption from another broadcaster', async () => {
        await expect(
            post(signedRedemption({ broadcasterUserId: UNKNOWN_TWITCH_ID })),
        ).resolves.toBe(HttpStatus.NO_CONTENT);

        await expect(pointsOfViewer()).resolves.toBe(STARTING_POINTS);
        await expect(messages.countDocuments()).resolves.toBe(0);
    });

    it('does not move the balance for a zero-cost reward', async () => {
        await expect(post(signedRedemption({ cost: 0 }))).resolves.toBe(
            HttpStatus.NO_CONTENT,
        );

        await expect(pointsOfViewer()).resolves.toBe(STARTING_POINTS);
    });

    it('broadcasts streamer-live once for stream.online, even when redelivered', async () => {
        const signed = signedStreamOnline();

        await expect(post(signed)).resolves.toBe(HttpStatus.NO_CONTENT);
        await waitForTopicSends(1);

        expect(harness.push.topicSends).toEqual([
            {
                topic: 'streamer-live',
                message: expect.objectContaining({
                    type: PushEventType.streamerLive,
                }),
            },
        ]);
        await expect(messages.find().lean().exec()).resolves.toEqual([
            expect.objectContaining({ outcome: 'broadcast' }),
        ]);

        await expect(post(signed)).resolves.toBe(HttpStatus.NO_CONTENT);
        await sleep(PUSH_WAIT_STEP_MS * 5);

        expect(harness.push.topicSends).toHaveLength(1);
    });

    it('recreates a revoked subscription on the fake Helix', async () => {
        const revoked = harness.helix.subscriptions.find(
            ({ type }) => type === EventSubSubscriptionType.redemptionAdd,
        );
        expect(revoked).toBeDefined();
        const revokedId = revoked!.id;
        harness.helix.setStatus(revokedId, AUTHORIZATION_REVOKED_STATUS);

        await expect(
            post(
                signedEventSubRequest({
                    messageType: EventSubMessageType.revocation,
                    body: revocationMessage(
                        EventSubSubscriptionType.redemptionAdd,
                        AUTHORIZATION_REVOKED_STATUS,
                        revokedId,
                    ),
                }),
            ),
        ).resolves.toBe(HttpStatus.NO_CONTENT);
        await harness.manager.reconcile();

        expect(harness.helix.calls).toEqual(
            expect.arrayContaining([
                { operation: 'delete', id: revokedId },
                {
                    operation: 'create',
                    type: EventSubSubscriptionType.redemptionAdd,
                },
            ]),
        );
    });
});
