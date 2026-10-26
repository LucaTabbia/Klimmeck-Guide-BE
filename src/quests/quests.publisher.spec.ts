import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { Quest, QuestDocument } from 'src/models/quest/quest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import type { SubscriberRegistry } from 'src/subscriber-registry';
import { QuestsPublisher } from './quests.publisher';
import type { QuestsService } from './quests.service';

const SETTLE_TICKS = 10;
const QUEST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_QUEST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function questState(id: string, state: string): Quest {
    return { _id: id, infos: { title: state } } as unknown as Quest;
}

async function settle(): Promise<void> {
    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('QuestsPublisher', () => {
    let findOne: jest.Mock<Promise<Quest>, [string]>;
    let publish: jest.Mock;
    let hasSubscribers: jest.Mock<boolean, [string]>;
    let stream: FakeChangeStream;
    let publisher: QuestsPublisher;

    const updateOf = (id: string) =>
        stream.emit('change', { documentKey: { _id: id } });

    beforeEach(() => {
        findOne = jest.fn();
        // publish del PubSub ritorna void: la spy non restituisce nulla da attendere
        publish = jest.fn().mockReturnValue(undefined);
        hasSubscribers = jest.fn().mockReturnValue(true);
        stream = new FakeChangeStream();
        publisher = new QuestsPublisher(
            {
                watch: jest.fn().mockReturnValue(stream),
            } as unknown as Model<QuestDocument>,
            { findOne } as unknown as QuestsService,
            { publish } as unknown as PubSub<PubSubEvents>,
            { hasSubscribers } as unknown as SubscriberRegistry,
        );
        publisher.onModuleInit();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('reads a quest again only after the previous read of the same quest has published', async () => {
        const stale = deferred<Quest>();
        const fresh = deferred<Quest>();
        findOne
            .mockReturnValueOnce(stale.promise)
            .mockReturnValueOnce(fresh.promise);

        updateOf(QUEST_ID);
        updateOf(QUEST_ID);
        await settle();
        expect(findOne).toHaveBeenCalledTimes(1);

        fresh.resolve(questState(QUEST_ID, 'fresh'));
        stale.resolve(questState(QUEST_ID, 'stale'));
        await settle();

        expect(findOne).toHaveBeenCalledTimes(2);
        expect(publish).toHaveBeenLastCalledWith('questUpdated', QUEST_ID, {
            questUpdated: questState(QUEST_ID, 'fresh'),
        });
    });

    it('coalesces a burst on the same quest into at most two reads', async () => {
        findOne
            .mockResolvedValueOnce(questState(QUEST_ID, 'first'))
            .mockResolvedValueOnce(questState(QUEST_ID, 'last'));

        updateOf(QUEST_ID);
        updateOf(QUEST_ID);
        updateOf(QUEST_ID);
        await settle();

        expect(findOne).toHaveBeenCalledTimes(2);
        expect(publish).toHaveBeenLastCalledWith('questUpdated', QUEST_ID, {
            questUpdated: questState(QUEST_ID, 'last'),
        });
    });

    it('reads different quests independently', async () => {
        const slow = deferred<Quest>();
        findOne
            .mockReturnValueOnce(slow.promise)
            .mockResolvedValueOnce(questState(OTHER_QUEST_ID, 'other'));

        updateOf(QUEST_ID);
        updateOf(OTHER_QUEST_ID);
        await settle();

        expect(findOne.mock.calls).toEqual([[QUEST_ID], [OTHER_QUEST_ID]]);
        expect(publish).toHaveBeenCalledWith('questUpdated', OTHER_QUEST_ID, {
            questUpdated: questState(OTHER_QUEST_ID, 'other'),
        });
        slow.resolve(questState(QUEST_ID, 'slow'));
        await settle();
    });

    it('skips the read of a quest nobody subscribed to', async () => {
        hasSubscribers.mockImplementation(
            (topic) => topic === `questUpdated:${OTHER_QUEST_ID}`,
        );
        findOne.mockResolvedValue(questState(OTHER_QUEST_ID, 'watched'));

        updateOf(QUEST_ID);
        updateOf(OTHER_QUEST_ID);
        await settle();

        expect(findOne.mock.calls).toEqual([[OTHER_QUEST_ID]]);
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('closes the stream and stops listening to updates at shutdown', async () => {
        await publisher.onModuleDestroy();
        updateOf(QUEST_ID);
        await settle();

        expect(stream.close).toHaveBeenCalledTimes(1);
        expect(stream.listenerCount('change')).toBe(0);
        expect(findOne).not.toHaveBeenCalled();
    });

    it('drops a read that completes after shutdown started', async () => {
        const late = deferred<Quest>();
        findOne.mockReturnValueOnce(late.promise);

        updateOf(QUEST_ID);
        await settle();
        await publisher.onModuleDestroy();
        late.resolve(questState(QUEST_ID, 'late'));
        await settle();

        expect(publish).not.toHaveBeenCalled();
    });
});
