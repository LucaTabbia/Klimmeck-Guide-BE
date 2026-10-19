import { HttpStatus } from '@nestjs/common';
import type { Model } from 'mongoose';
import request from 'supertest';
import {
    EventSubMessage,
    EventSubMessageDocument,
} from 'src/eventsub/eventsub-message.model';
import {
    EventSubMessageType,
    EventSubSubscriptionType,
} from 'src/eventsub/eventsub-types';
import { User, UserDocument } from 'src/models/user.model';
import {
    redemptionNotification,
    signedEventSubRequest,
    TEST_CHALLENGE,
    TEST_VIEWER_TWITCH_ID,
    verificationChallenge,
} from '../../test/eventsub/eventsub-fixtures';
import type { SignedEventSubRequest } from '../../test/eventsub/eventsub-fixtures';
import {
    createEventSubTestApp,
    EVENTSUB_WEBHOOK_PATH,
    EventSubTestApp,
    postEventSub,
} from '../../test/eventsub/eventsub-test-app';
import {
    buildLocalEventSubConfig,
    buildTestEventSubConfig,
} from '../../test/eventsub/test-eventsub-config';
import { persistUser } from '../../test/fixtures/user.fixture';

const STARTING_POINTS = 100;
const STALE_TIMESTAMP_MS = 11 * 60 * 1000;
const OVERSIZED_BODY_BYTES = 120 * 1024;

const signedChallenge = (secret?: string): SignedEventSubRequest =>
    signedEventSubRequest({
        messageType: EventSubMessageType.verification,
        body: verificationChallenge(),
        secret,
    });

const signedRedemption = (timestamp?: string): SignedEventSubRequest =>
    signedEventSubRequest({
        messageType: EventSubMessageType.notification,
        body: redemptionNotification(),
        timestamp,
    });

function tamperSignature(signed: SignedEventSubRequest): SignedEventSubRequest {
    const header = 'twitch-eventsub-message-signature';
    const signature = signed.headers[header];
    const last = signature.at(-1) === '0' ? '1' : '0';
    return {
        ...signed,
        headers: { ...signed.headers, [header]: signature.slice(0, -1) + last },
    };
}

describe('EventSub webhook (wire, managed)', () => {
    let harness: EventSubTestApp;
    let messages: Model<EventSubMessageDocument>;
    let users: Model<UserDocument>;

    beforeAll(async () => {
        harness = await createEventSubTestApp(buildTestEventSubConfig());
        messages = harness.connection.model<EventSubMessageDocument>(
            EventSubMessage.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
    });

    afterEach(() => harness.clearDatabase());

    afterAll(() => harness.close());

    async function pointsOfViewer(): Promise<number | undefined> {
        const user = await users
            .findOne({ twitchId: TEST_VIEWER_TWITCH_ID }, { twitchPoints: 1 })
            .lean<{ twitchPoints: number } | null>()
            .exec();
        return user?.twitchPoints;
    }

    it('reconciles the two desired subscriptions on the fake Helix at boot', () => {
        expect(harness.helix.createRequests.map(({ type }) => type)).toEqual(
            expect.arrayContaining([
                EventSubSubscriptionType.redemptionAdd,
                EventSubSubscriptionType.streamOnline,
            ]),
        );
        expect(harness.helix.createRequests).toHaveLength(2);
    });

    it('answers a signed challenge with the bare challenge as text/plain', async () => {
        const response = await postEventSub(harness.app, signedChallenge());

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.headers['content-type']).toMatch(/^text\/plain/);
        expect(response.headers['content-length']).toBe(
            String(TEST_CHALLENGE.length),
        );
        expect(response.text).toBe(TEST_CHALLENGE);
    });

    it('rejects a challenge signed with another secret with an empty 403', async () => {
        const response = await postEventSub(
            harness.app,
            signedChallenge('another-secret-0123456789'),
        );

        expect(response.status).toBe(HttpStatus.FORBIDDEN);
        expect(response.text).toBe('');
    });

    it('rejects a tampered signature without writing anything', async () => {
        await persistUser(users, {
            twitchId: TEST_VIEWER_TWITCH_ID,
            twitchPoints: STARTING_POINTS,
        });

        const response = await postEventSub(
            harness.app,
            tamperSignature(signedRedemption()),
        );

        expect(response.status).toBe(HttpStatus.FORBIDDEN);
        expect(response.text).toBe('');
        await expect(messages.countDocuments()).resolves.toBe(0);
        await expect(pointsOfViewer()).resolves.toBe(STARTING_POINTS);
    });

    it('rejects a correctly signed message older than the replay window', async () => {
        const stale = new Date(Date.now() - STALE_TIMESTAMP_MS).toISOString();

        const response = await postEventSub(
            harness.app,
            signedRedemption(stale),
        );

        expect(response.status).toBe(HttpStatus.FORBIDDEN);
        await expect(messages.countDocuments()).resolves.toBe(0);
    });

    it('rejects a request without the EventSub headers', async () => {
        const response = await request(harness.app.getHttpServer())
            .post(EVENTSUB_WEBHOOK_PATH)
            .set('Content-Type', 'application/json')
            .send(signedRedemption().body);

        expect(response.status).toBe(HttpStatus.FORBIDDEN);
        expect(response.text).toBe('');
    });

    it('rejects a signed body sent as text/plain (no raw JSON body)', async () => {
        const response = await postEventSub(
            harness.app,
            signedChallenge(),
            'text/plain',
        );

        expect(response.status).toBe(HttpStatus.FORBIDDEN);
        expect(response.text).toBe('');
    });

    it('reaches the public handler without a bearer', async () => {
        const response = await postEventSub(harness.app, signedChallenge());

        expect(response.status).not.toBe(HttpStatus.UNAUTHORIZED);
        expect(response.status).toBe(HttpStatus.OK);
    });

    it('acknowledges an unknown signed message type with an empty 204', async () => {
        const response = await postEventSub(
            harness.app,
            signedEventSubRequest({
                messageType: 'unknown_type',
                body: redemptionNotification(),
            }),
        );

        expect(response.status).toBe(HttpStatus.NO_CONTENT);
        expect(response.text).toBe('');
    });

    it('refuses an oversized JSON body before the handler with 413', async () => {
        const response = await postEventSub(
            harness.app,
            signedEventSubRequest({
                messageType: EventSubMessageType.notification,
                body: { padding: 'x'.repeat(OVERSIZED_BODY_BYTES) },
            }),
        );

        expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
        await expect(messages.countDocuments()).resolves.toBe(0);
    });
});

describe('EventSub webhook (wire, disabled)', () => {
    let harness: EventSubTestApp;

    beforeAll(async () => {
        harness = await createEventSubTestApp({ mode: 'disabled' });
    });

    afterAll(() => harness.close());

    it('rejects even a correctly signed challenge with an empty 403', async () => {
        const response = await postEventSub(harness.app, signedChallenge());

        expect(response.status).toBe(HttpStatus.FORBIDDEN);
        expect(response.text).toBe('');
        expect(harness.helix.calls).toEqual([]);
    });
});

describe('EventSub webhook (wire, local mode)', () => {
    let harness: EventSubTestApp;

    beforeAll(async () => {
        harness = await createEventSubTestApp(buildLocalEventSubConfig());
    });

    afterAll(() => harness.close());

    it('answers a signed challenge without calling Helix', async () => {
        const response = await postEventSub(harness.app, signedChallenge());

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.text).toBe(TEST_CHALLENGE);
        expect(harness.helix.calls).toEqual([]);
    });
});
