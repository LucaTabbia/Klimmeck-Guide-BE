import { MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EconomyModule } from 'src/economy/economy.module';
import { WalletService } from 'src/economy/wallet.service';
import {
    EventSubMessage,
    EventSubMessageDocument,
    EventSubMessageSchema,
} from 'src/eventsub/eventsub-message.model';
import type { RedemptionEvent } from 'src/eventsub/eventsub-payload';
import {
    CreditOutcome,
    PointsCreditService,
} from 'src/eventsub/points-credit.service';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import {
    TEST_BROADCASTER_ID,
    TEST_VIEWER_TWITCH_ID,
} from '../../test/eventsub/eventsub-fixtures';
import { persistUser } from '../../test/fixtures/user.fixture';

const RECEIVED_AT = new Date('2026-10-30T10:00:00Z');
const STARTING_POINTS = 100;

const REDEMPTION: RedemptionEvent = {
    id: 'redemption-1',
    broadcasterUserId: TEST_BROADCASTER_ID,
    userId: TEST_VIEWER_TWITCH_ID,
    rewardId: 'reward-1',
    cost: 250,
};

function ledgerFailure(): Error {
    return Object.assign(new Error('fake-ledger-failure'), {
        name: 'MongoServerError',
        code: 91,
    });
}

describe('PointsCreditService (replSet)', () => {
    let harness: AuthTestApp;
    let credits: PointsCreditService;
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
            providers: [PointsCreditService],
        });
        credits = harness.app.get(PointsCreditService);
        wallet = harness.app.get(WalletService);
        messages = harness.connection.model<EventSubMessageDocument>(
            EventSubMessage.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        await Promise.all([messages.init(), users.init()]);
    });

    beforeEach(async () => {
        await persistUser(users, {
            twitchId: TEST_VIEWER_TWITCH_ID,
            twitchPoints: STARTING_POINTS,
        });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(() => harness.close());

    async function viewerPoints(): Promise<number | undefined> {
        const user = await users
            .findOne({ twitchId: TEST_VIEWER_TWITCH_ID }, { twitchPoints: 1 })
            .lean<{ twitchPoints: number } | null>()
            .exec();
        return user?.twitchPoints;
    }

    it('credits a redemption once when Twitch delivers it twice concurrently', async () => {
        const outcomes = await Promise.all([
            credits.credit(REDEMPTION, 'msg-first', RECEIVED_AT),
            credits.credit(REDEMPTION, 'msg-second', RECEIVED_AT),
        ]);

        expect([...outcomes].sort()).toEqual([
            CreditOutcome.credited,
            CreditOutcome.duplicate,
        ]);
        await expect(viewerPoints()).resolves.toBe(
            STARTING_POINTS + REDEMPTION.cost,
        );
        await expect(messages.countDocuments()).resolves.toBe(1);
    });

    it('leaves no delivery record when the ledger write fails, so the retry can credit', async () => {
        const failure = ledgerFailure();
        jest.spyOn(wallet, 'creditUserPoints').mockRejectedValueOnce(failure);

        await expect(
            credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
        ).rejects.toBe(failure);
        await expect(messages.countDocuments()).resolves.toBe(0);
        await expect(viewerPoints()).resolves.toBe(STARTING_POINTS);

        await expect(
            credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
        ).resolves.toBe(CreditOutcome.credited);
        await expect(viewerPoints()).resolves.toBe(
            STARTING_POINTS + REDEMPTION.cost,
        );
    });

    it('rethrows a failure of the delivery record without crediting', async () => {
        const failure = ledgerFailure();
        jest.spyOn(messages, 'create').mockRejectedValueOnce(failure);

        await expect(
            credits.credit(REDEMPTION, 'msg-1', RECEIVED_AT),
        ).rejects.toBe(failure);
        await expect(viewerPoints()).resolves.toBe(STARTING_POINTS);
    });
});
