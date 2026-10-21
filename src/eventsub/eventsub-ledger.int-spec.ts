import { MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { EconomyModule } from 'src/economy/economy.module';
import { WalletService } from 'src/economy/wallet.service';
import {
    EventSubMessage,
    EventSubMessageDocument,
    EventSubMessageSchema,
} from 'src/eventsub/eventsub-message.model';
import { EventSubMessageIndexVerifier } from 'src/eventsub/eventsub-message-index.verifier';
import type {
    RedemptionEvent,
    StreamOnlineEvent,
} from 'src/eventsub/eventsub-payload';
import {
    CreditOutcome,
    PointsCreditService,
} from 'src/eventsub/points-credit.service';
import {
    StreamOnlineOutcome,
    StreamOnlineRecorder,
} from 'src/eventsub/stream-online.recorder';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import {
    TEST_BROADCASTER_ID,
    TEST_VIEWER_TWITCH_ID,
} from '../../test/eventsub/eventsub-fixtures';
import { persistUser } from '../../test/fixtures/user.fixture';

const RECEIVED_AT = new Date('2026-10-19T10:00:00Z');
const STARTING_POINTS = 100;
const CONCURRENT_DELIVERIES = 5;
const OTHER_VIEWER_TWITCH_ID = '33333';
const UNKNOWN_VIEWER_TWITCH_ID = '99999';

const REDEMPTION: RedemptionEvent = {
    id: 'redemption-1',
    broadcasterUserId: TEST_BROADCASTER_ID,
    userId: TEST_VIEWER_TWITCH_ID,
    rewardId: 'reward-1',
    cost: 250,
};

const STREAM_ONLINE: StreamOnlineEvent = {
    id: '53418160',
    broadcasterUserId: TEST_BROADCASTER_ID,
    type: 'live',
};

describe('EventSub ledger (replSet)', () => {
    let harness: AuthTestApp;
    let credits: PointsCreditService;
    let recorder: StreamOnlineRecorder;
    let wallet: WalletService;
    let messages: Model<EventSubMessageDocument>;
    let users: Model<UserDocument>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                EconomyModule,
                MongooseModule.forFeature([
                    {
                        name: EventSubMessage.name,
                        schema: EventSubMessageSchema,
                    },
                    { name: User.name, schema: UserSchema },
                ]),
            ],
            providers: [
                PointsCreditService,
                StreamOnlineRecorder,
                EventSubMessageIndexVerifier,
            ],
        });
        credits = harness.app.get(PointsCreditService);
        recorder = harness.app.get(StreamOnlineRecorder);
        wallet = harness.app.get(WalletService);
        messages = harness.connection.model<EventSubMessageDocument>(
            EventSubMessage.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        // collection e indici unici pronti prima delle gare (Pitfall 5)
        await Promise.all([messages.init(), users.init()]);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(() => harness.close());

    async function persistViewer(): Promise<UserDocument> {
        return persistUser(users, {
            twitchId: TEST_VIEWER_TWITCH_ID,
            twitchPoints: STARTING_POINTS,
        }) as Promise<UserDocument>;
    }

    async function pointsOf(twitchId: string): Promise<number | undefined> {
        const user = await users
            .findOne({ twitchId }, { twitchPoints: 1 })
            .lean<{ twitchPoints: number } | null>()
            .exec();
        return user?.twitchPoints;
    }

    it('builds the message, event and TTL indexes at boot', async () => {
        await expect(messages.collection.indexes()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'eventsub_message_id_unique',
                    key: { messageId: 1 },
                    unique: true,
                }),
                expect.objectContaining({
                    name: 'eventsub_event_unique',
                    key: { type: 1, eventId: 1 },
                    unique: true,
                    partialFilterExpression: { eventId: { $type: 'string' } },
                }),
                expect.objectContaining({
                    name: 'eventsub_message_ttl',
                    key: { receivedAt: 1 },
                    expireAfterSeconds: 604800,
                }),
            ]),
        );
    });

    describe('PointsCreditService.credit', () => {
        it('credits the redemption cost once and records the delivery', async () => {
            await persistViewer();

            await expect(
                credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
            ).resolves.toBe(CreditOutcome.credited);

            expect(await pointsOf(TEST_VIEWER_TWITCH_ID)).toBe(350);
            const rows = await messages.find().lean();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                messageId: 'msg-1',
                type: 'channel.channel_points_custom_reward_redemption.add',
                eventId: 'redemption-1',
                twitchUserId: TEST_VIEWER_TWITCH_ID,
                rewardId: 'reward-1',
                amount: 250,
                outcome: 'credited',
                receivedAt: RECEIVED_AT,
            });
        });

        it('treats a redelivered message id as a duplicate without crediting again', async () => {
            await persistViewer();
            await credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT);

            await expect(
                credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
            ).resolves.toBe(CreditOutcome.duplicate);

            expect(await pointsOf(TEST_VIEWER_TWITCH_ID)).toBe(350);
            await expect(messages.countDocuments()).resolves.toBe(1);
        });

        it('credits exactly once when the same message is delivered concurrently', async () => {
            await persistViewer();

            const outcomes = await Promise.all(
                Array.from({ length: CONCURRENT_DELIVERIES }, () =>
                    credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
                ),
            );

            expect(
                outcomes.filter((o) => o === CreditOutcome.credited),
            ).toHaveLength(1);
            expect(
                outcomes.filter((o) => o === CreditOutcome.duplicate),
            ).toHaveLength(CONCURRENT_DELIVERIES - 1);
            expect(await pointsOf(TEST_VIEWER_TWITCH_ID)).toBe(350);
            await expect(messages.countDocuments()).resolves.toBe(1);
        });

        it('treats the same event delivered with another message id as a duplicate', async () => {
            await persistViewer();
            await credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT);

            await expect(
                credits.credit(REDEMPTION, 'msg-2', RECEIVED_AT),
            ).resolves.toBe(CreditOutcome.duplicate);

            expect(await pointsOf(TEST_VIEWER_TWITCH_ID)).toBe(350);
            await expect(messages.countDocuments()).resolves.toBe(1);
        });

        it('leaves no trace for a viewer without an account', async () => {
            await persistUser(users, {
                twitchId: OTHER_VIEWER_TWITCH_ID,
                twitchPoints: STARTING_POINTS,
            });

            await expect(
                credits.credit(
                    { ...REDEMPTION, userId: UNKNOWN_VIEWER_TWITCH_ID },
                    'msg-1',
                    RECEIVED_AT,
                ),
            ).resolves.toBe(CreditOutcome.unknownViewer);

            await expect(messages.countDocuments()).resolves.toBe(0);
            expect(await pointsOf(OTHER_VIEWER_TWITCH_ID)).toBe(
                STARTING_POINTS,
            );
        });

        it('aborts the delivery record when the user disappears before the credit', async () => {
            await persistViewer();
            jest.spyOn(wallet, 'creditUserPoints').mockRejectedValueOnce(
                ResourceNotFoundException.user(),
            );

            await expect(
                credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
            ).resolves.toBe(CreditOutcome.unknownViewer);

            await expect(messages.countDocuments()).resolves.toBe(0);
        });

        it('propagates a database failure without partial writes', async () => {
            await persistViewer();
            const failure = Object.assign(new Error('boom'), {
                name: 'MongoServerError',
                code: 91,
            });
            jest.spyOn(wallet, 'creditUserPoints').mockRejectedValueOnce(
                failure,
            );

            await expect(
                credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
            ).rejects.toBe(failure);

            await expect(messages.countDocuments()).resolves.toBe(0);
            expect(await pointsOf(TEST_VIEWER_TWITCH_ID)).toBe(STARTING_POINTS);
        });
    });

    describe('StreamOnlineRecorder.record', () => {
        it('records a stream online event once', async () => {
            await expect(
                recorder.record(STREAM_ONLINE, 'msg-live', RECEIVED_AT),
            ).resolves.toBe(StreamOnlineOutcome.recorded);

            const rows = await messages.find().lean();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                messageId: 'msg-live',
                type: 'stream.online',
                eventId: '53418160',
                outcome: 'broadcast',
                twitchUserId: null,
                rewardId: null,
                amount: null,
                receivedAt: RECEIVED_AT,
            });
        });

        it('treats a redelivered message id as a duplicate', async () => {
            await recorder.record(STREAM_ONLINE, 'msg-live', RECEIVED_AT);

            await expect(
                recorder.record(STREAM_ONLINE, 'msg-live', RECEIVED_AT),
            ).resolves.toBe(StreamOnlineOutcome.duplicate);

            await expect(messages.countDocuments()).resolves.toBe(1);
        });

        it('treats the same event delivered with another message id as a duplicate', async () => {
            await recorder.record(STREAM_ONLINE, 'msg-live', RECEIVED_AT);

            await expect(
                recorder.record(STREAM_ONLINE, 'msg-live-2', RECEIVED_AT),
            ).resolves.toBe(StreamOnlineOutcome.duplicate);

            await expect(messages.countDocuments()).resolves.toBe(1);
        });
    });
});
