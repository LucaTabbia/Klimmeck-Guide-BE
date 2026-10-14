import { createPubSub } from '@graphql-yoga/subscription';
import { subscribeWithSnapshot } from 'src/graphql/subscribe-with-snapshot';

type FakeIterator = {
    next: jest.Mock;
    return: jest.Mock;
};

function fakeLive(next: jest.Mock): {
    live: AsyncIterable<string>;
    iterator: FakeIterator;
} {
    const iterator: FakeIterator = {
        next,
        return: jest.fn(() =>
            Promise.resolve({ done: true, value: undefined }),
        ),
    };
    const live = {
        [Symbol.asyncIterator]: () => iterator,
    } as unknown as AsyncIterable<string>;
    return { live, iterator };
}

function neverResolvingLive(): ReturnType<typeof fakeLive> {
    return fakeLive(jest.fn(() => new Promise(() => undefined)));
}

async function settlesWithin<T>(promise: Promise<T>, ms: number) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

describe('subscribeWithSnapshot', () => {
    it('emits the snapshot, then events published while loading it, then live events', async () => {
        const pubSub = createPubSub<{ topic: [value: string] }>();

        const iterator = await subscribeWithSnapshot(
            pubSub.subscribe('topic'),
            () => {
                pubSub.publish('topic', 'during');
                return Promise.resolve('snapshot');
            },
        );
        pubSub.publish('topic', 'after');

        const values = [
            (await iterator.next()).value,
            (await iterator.next()).value,
            (await iterator.next()).value,
        ];
        await iterator.return?.();

        expect(values).toEqual(['snapshot', 'during', 'after']);
    });

    it('rejects with the snapshot error and closes the live stream', async () => {
        const { live, iterator } = neverResolvingLive();
        const failure = new Error('snapshot failed');

        await expect(
            subscribeWithSnapshot(live, () => Promise.reject(failure)),
        ).rejects.toBe(failure);
        expect(iterator.return).toHaveBeenCalledTimes(1);
    });

    it('returns promptly and detaches the live stream when no event arrives', async () => {
        const { live, iterator } = neverResolvingLive();
        const subscription = await subscribeWithSnapshot(live, () =>
            Promise.resolve('snapshot'),
        );
        expect((await subscription.next()).value).toBe('snapshot');

        const outcome = await settlesWithin(subscription.return!(), 100);

        expect(outcome).not.toBe('timeout');
        expect(iterator.return).toHaveBeenCalled();
    });

    it('completes when the live stream ends', async () => {
        const { live } = fakeLive(
            jest
                .fn()
                .mockResolvedValueOnce({ done: false, value: 'a' })
                .mockResolvedValueOnce({ done: true, value: undefined }),
        );
        const subscription = await subscribeWithSnapshot(live, () =>
            Promise.resolve('snapshot'),
        );

        expect(await subscription.next()).toEqual({
            done: false,
            value: 'snapshot',
        });
        expect(await subscription.next()).toEqual({ done: false, value: 'a' });
        expect((await subscription.next()).done).toBe(true);
    });
});
