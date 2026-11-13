import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import { type Model, Types } from 'mongoose';
import type { Quest, QuestDocument } from 'src/models/quest/quest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import type { SubscriberRegistry } from 'src/subscriber-registry';
import { QuestsPublisher } from './quests.publisher';
import type { QuestsService } from './quests.service';

const SETTLE_TICKS = 10;
const QUEST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_QUEST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AID_ID = 'cccccccccccccccccccccccc';
const CONCLUDED_AT = new Date('2026-11-13T10:00:00.000Z');

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
    let watch: jest.Mock;
    let aidRead: jest.Mock;
    let publisher: QuestsPublisher;

    const updateOf = (id: string) =>
        stream.emit('change', { documentKey: { _id: id } });

    beforeEach(() => {
        findOne = jest.fn();
        // publish del PubSub ritorna void: la spy non restituisce nulla da attendere
        publish = jest.fn().mockReturnValue(undefined);
        hasSubscribers = jest.fn().mockReturnValue(true);
        stream = new FakeChangeStream();
        watch = jest.fn().mockReturnValue(stream);
        aidRead = jest.fn().mockReturnValue({
            lean: () => ({
                exec: () =>
                    Promise.resolve({
                        rescue: { failedQuest: new Types.ObjectId(QUEST_ID) },
                    }),
            }),
        });
        publisher = new QuestsPublisher(
            { watch, findOne: aidRead } as unknown as Model<QuestDocument>,
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

    describe('the source quest of an aid (quick 261113-aql)', () => {
        const aidBornFrom = (failedQuest: unknown) =>
            stream.emit('change', {
                operationType: 'insert',
                documentKey: { _id: new Types.ObjectId(AID_ID) },
                fullDocument: {
                    _id: new Types.ObjectId(AID_ID),
                    infos: { type: 'aid' },
                    rescue: { failedQuest },
                },
            });

        const aidUpdated = (updatedFields: Record<string, unknown>) =>
            stream.emit('change', {
                operationType: 'update',
                documentKey: { _id: new Types.ObjectId(AID_ID) },
                updateDescription: { updatedFields, removedFields: [] },
            });

        beforeEach(() => {
            findOne.mockImplementation((id) =>
                Promise.resolve(questState(id, 'read')),
            );
        });

        it('watches the updates and the birth of the aids only (quick 261113-aql)', () => {
            expect(watch).toHaveBeenCalledWith([
                {
                    $match: {
                        $or: [
                            { operationType: { $in: ['update', 'replace'] } },
                            {
                                operationType: 'insert',
                                'fullDocument.infos.type': 'aid',
                            },
                        ],
                    },
                },
            ]);
        });

        it('republishes the source quest when an aid is born from it (quick 261113-aql)', async () => {
            aidBornFrom(new Types.ObjectId(QUEST_ID));
            await settle();

            expect(findOne.mock.calls).toEqual([[QUEST_ID]]);
            expect(publish).toHaveBeenCalledWith('questUpdated', QUEST_ID, {
                questUpdated: questState(QUEST_ID, 'read'),
            });
        });

        it('republishes the source quest when its aid concludes (quick 261113-aql)', async () => {
            aidUpdated({ concludedAt: CONCLUDED_AT });
            await settle();

            expect(aidRead).toHaveBeenCalledWith(
                { _id: new Types.ObjectId(AID_ID), 'infos.type': 'aid' },
                { 'rescue.failedQuest': 1 },
            );
            expect(findOne.mock.calls).toEqual(
                expect.arrayContaining([[AID_ID], [QUEST_ID]]),
            );
            expect(publish).toHaveBeenCalledWith('questUpdated', QUEST_ID, {
                questUpdated: questState(QUEST_ID, 'read'),
            });
        });

        it('reads no source on an update that concludes nothing (quick 261113-aql)', async () => {
            aidUpdated({ 'infos.title': 'Soccorso: Le cripte' });
            await settle();

            expect(aidRead).not.toHaveBeenCalled();
            expect(findOne.mock.calls).toEqual([[AID_ID]]);
        });

        it('republishes nothing for an aid without a readable source (quick 261113-aql)', async () => {
            aidBornFrom(undefined);
            await settle();

            expect(findOne).not.toHaveBeenCalled();
            expect(publish).not.toHaveBeenCalled();
        });
    });
});
