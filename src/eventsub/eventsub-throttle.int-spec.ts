import { HttpStatus } from '@nestjs/common';
import type { Model } from 'mongoose';
import { EventSubMessageType } from 'src/eventsub/eventsub-types';
import { User, UserDocument } from 'src/models/user.model';
import request from 'supertest';
import {
    redemptionNotification,
    signedEventSubRequest,
    TEST_VIEWER_TWITCH_ID,
} from '../../test/eventsub/eventsub-fixtures';
import {
    createEventSubTestApp,
    EVENTSUB_WEBHOOK_PATH,
    EventSubTestApp,
    postEventSub,
} from '../../test/eventsub/eventsub-test-app';
import { buildTestEventSubConfig } from '../../test/eventsub/test-eventsub-config';
import { persistUser } from '../../test/fixtures/user.fixture';

const BASE_LIMIT = 2;
const STARTING_POINTS = 100;
const REWARD_COST = 250;
const BURST_SIZE = 10;
const SMALL_WEBHOOK_LIMIT = 3;

const signedRedemption = (index: number) =>
    signedEventSubRequest({
        messageType: EventSubMessageType.notification,
        body: redemptionNotification({ eventId: `redemption-burst-${index}` }),
    });

describe('EventSub webhook throttling (wire, replSet)', () => {
    describe('with a webhook bucket far above the base limit', () => {
        let harness: EventSubTestApp;
        let users: Model<UserDocument>;

        beforeAll(async () => {
            harness = await createEventSubTestApp(buildTestEventSubConfig(), {
                throttle: { limit: BASE_LIMIT, webhookLimit: 100 },
            });
            users = harness.connection.model<UserDocument>(User.name);
            await users.init();
            await persistUser(users, {
                twitchId: TEST_VIEWER_TWITCH_ID,
                twitchPoints: STARTING_POINTS,
            });
        });

        afterAll(() => harness.close());

        it('answers 204 to every signed redemption of a burst above the base limit (D-08, Pitfall 8)', async () => {
            const statuses: number[] = [];
            for (let index = 0; index < BURST_SIZE; index += 1) {
                const response = await postEventSub(
                    harness.app,
                    signedRedemption(index),
                );
                statuses.push(response.status);
            }

            expect(statuses).toEqual(
                Array.from({ length: BURST_SIZE }, () => HttpStatus.NO_CONTENT),
            );
            const viewer = await users
                .findOne({ twitchId: TEST_VIEWER_TWITCH_ID })
                .lean()
                .exec();
            expect(viewer?.twitchPoints).toBe(
                STARTING_POINTS + BURST_SIZE * REWARD_COST,
            );
        });
    });

    describe('with a small webhook bucket', () => {
        let harness: EventSubTestApp;

        beforeAll(async () => {
            harness = await createEventSubTestApp(buildTestEventSubConfig(), {
                throttle: {
                    limit: BASE_LIMIT,
                    webhookLimit: SMALL_WEBHOOK_LIMIT,
                },
            });
        });

        afterAll(() => harness.close());

        it('limits the webhook only beyond its own bucket (D-08)', async () => {
            const unsignedDelivery = () =>
                request(harness.app.getHttpServer())
                    .post(EVENTSUB_WEBHOOK_PATH)
                    .set('Content-Type', 'application/json')
                    .send('{}');

            const statuses: number[] = [];
            for (let call = 0; call <= SMALL_WEBHOOK_LIMIT; call += 1) {
                statuses.push((await unsignedDelivery()).status);
            }

            expect(statuses).toEqual([
                HttpStatus.FORBIDDEN,
                HttpStatus.FORBIDDEN,
                HttpStatus.FORBIDDEN,
                HttpStatus.TOO_MANY_REQUESTS,
            ]);
        });
    });
});
