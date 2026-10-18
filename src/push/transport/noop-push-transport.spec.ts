import { streamerLive, travelEnd } from 'src/push/push-events';
import { STREAMER_LIVE_TOPIC } from 'src/push/push-message';
import { NoopPushTransport } from 'src/push/transport/noop-push-transport';
import { FCM_MULTICAST_LIMIT } from 'src/push/transport/push-transport';
import { FakePushTransport } from '../../../test/push/fake-push-transport';

describe('NoopPushTransport', () => {
    const transport = new NoopPushTransport();

    it('is disabled', () => {
        expect(transport.enabled).toBe(false);
    });

    it('reports every token as not delivered because push is disabled', async () => {
        await expect(
            transport.sendToTokens(['a', 'b'], travelEnd('c1')),
        ).resolves.toEqual([
            { token: 'a', delivered: false, errorCode: 'push-disabled' },
            { token: 'b', delivered: false, errorCode: 'push-disabled' },
        ]);
    });

    it('reports the topic send as not delivered because push is disabled', async () => {
        await expect(
            transport.sendToTopic(STREAMER_LIVE_TOPIC, streamerLive()),
        ).resolves.toEqual({ delivered: false, errorCode: 'push-disabled' });
    });

    it('ignores topic subscription changes', async () => {
        await expect(
            transport.subscribeToTopic(['a'], STREAMER_LIVE_TOPIC),
        ).resolves.toBeUndefined();
        await expect(
            transport.unsubscribeFromTopic(['a'], STREAMER_LIVE_TOPIC),
        ).resolves.toBeUndefined();
    });

    it('caps a multicast at the FCM limit of 500 tokens', () => {
        expect(FCM_MULTICAST_LIMIT).toBe(500);
    });
});

describe('FakePushTransport', () => {
    let transport: FakePushTransport;

    beforeEach(() => {
        transport = new FakePushTransport();
    });

    it('delivers every token by default and records the send', async () => {
        const message = travelEnd('c1');

        await expect(
            transport.sendToTokens(['a', 'b'], message),
        ).resolves.toEqual([
            { token: 'a', delivered: true },
            { token: 'b', delivered: true },
        ]);
        expect(transport.enabled).toBe(true);
        expect(transport.sent).toEqual([{ tokens: ['a', 'b'], message }]);
    });

    it('fails a single token with the configured error code', async () => {
        transport.failToken('b', 'messaging/registration-token-not-registered');

        const outcomes = await transport.sendToTokens(
            ['a', 'b'],
            travelEnd('c1'),
        );

        expect(outcomes[1]).toEqual({
            token: 'b',
            delivered: false,
            errorCode: 'messaging/registration-token-not-registered',
        });
    });

    it('fails the topic send with the configured error code and records it', async () => {
        transport.failTopicSend('messaging/server-unavailable');
        const message = streamerLive();

        await expect(
            transport.sendToTopic(STREAMER_LIVE_TOPIC, message),
        ).resolves.toEqual({
            delivered: false,
            errorCode: 'messaging/server-unavailable',
        });
        expect(transport.topicSends).toEqual([
            { topic: STREAMER_LIVE_TOPIC, message },
        ]);
    });

    it('rejects topic management when configured, still recording the call', async () => {
        transport.failTopicManagement(new Error('boom'));

        await expect(
            transport.subscribeToTopic(['a'], STREAMER_LIVE_TOPIC),
        ).rejects.toThrow('boom');
        expect(transport.subscriptions).toEqual([
            { tokens: ['a'], topic: STREAMER_LIVE_TOPIC },
        ]);
    });

    it('reset clears recordings and failures and re-enables the transport', async () => {
        transport.enabled = false;
        transport.failToken('a', 'messaging/invalid-argument');
        transport.failTopicSend('messaging/server-unavailable');
        transport.failTopicManagement(new Error('boom'));
        await transport.sendToTokens(['a'], travelEnd('c1'));
        await transport.sendToTopic(STREAMER_LIVE_TOPIC, streamerLive());
        await transport
            .subscribeToTopic(['a'], STREAMER_LIVE_TOPIC)
            .catch(() => undefined);
        await transport
            .unsubscribeFromTopic(['a'], STREAMER_LIVE_TOPIC)
            .catch(() => undefined);

        transport.reset();

        expect(transport.enabled).toBe(true);
        expect(transport.sent).toEqual([]);
        expect(transport.topicSends).toEqual([]);
        expect(transport.subscriptions).toEqual([]);
        expect(transport.unsubscriptions).toEqual([]);
        await expect(
            transport.sendToTokens(['a'], travelEnd('c1')),
        ).resolves.toEqual([{ token: 'a', delivered: true }]);
        await expect(
            transport.sendToTopic(STREAMER_LIVE_TOPIC, streamerLive()),
        ).resolves.toEqual({ delivered: true });
        await expect(
            transport.subscribeToTopic(['a'], STREAMER_LIVE_TOPIC),
        ).resolves.toBeUndefined();
    });
});
