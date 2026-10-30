import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import type { PendingRequest } from 'src/models/pending-request.model';
import type { PubSubEvents } from 'src/pubsub.module';
import { PendingRequestsPublisher } from './pending-requests.publisher';
import type { PendingRequestsService } from './pending-requests.service';

const SETTLE_TICKS = 10;

function requestList(id: string): PendingRequest[] {
    return [{ id } as PendingRequest];
}

async function settle(): Promise<void> {
    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('PendingRequestsPublisher', () => {
    let list: jest.Mock<Promise<PendingRequest[]>, []>;
    let publish: jest.Mock;
    let watch: jest.Mock;
    let stream: FakeChangeStream;
    let publisher: PendingRequestsPublisher;

    beforeEach(() => {
        list = jest.fn();
        // publish del PubSub ritorna void: la spy non restituisce nulla da attendere
        publish = jest.fn().mockReturnValue(undefined);
        stream = new FakeChangeStream();
        watch = jest.fn().mockReturnValue(stream);
        publisher = new PendingRequestsPublisher(
            { watch } as unknown as Model<PendingQuestDocument>,
            { list } as unknown as PendingRequestsService,
            { publish } as unknown as PubSub<PubSubEvents>,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('coalesces a synchronous burst into at most two recomputations', async () => {
        list.mockResolvedValueOnce(requestList('first')).mockResolvedValueOnce(
            requestList('last'),
        );

        publisher.requestRefresh();
        publisher.requestRefresh();
        publisher.requestRefresh();
        await settle();

        expect(list.mock.calls.length).toBeLessThanOrEqual(2);
        expect(publish).toHaveBeenLastCalledWith('pendingRequestsUpdated', {
            pendingRequestsUpdated: requestList('last'),
        });
    });

    it('logs a failed recomputation and publishes on the next request', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        list.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(
            requestList('after'),
        );

        publisher.requestRefresh();
        await settle();
        expect(error).toHaveBeenCalledTimes(1);
        expect(publish).not.toHaveBeenCalled();

        publisher.requestRefresh();
        await settle();
        expect(publish).toHaveBeenCalledWith('pendingRequestsUpdated', {
            pendingRequestsUpdated: requestList('after'),
        });
    });

    it('republishes the whole queue when the change stream history is lost (D-17a)', async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        list.mockResolvedValue(requestList('resynced'));

        publisher.onModuleInit();
        stream.emit('error', Object.assign(new Error('fake'), { code: 286 }));
        await settle();

        expect(publish.mock.calls).toEqual([
            [
                'pendingRequestsUpdated',
                { pendingRequestsUpdated: requestList('resynced') },
            ],
        ]);
        await publisher.onModuleDestroy();
    });

    it('watches inserts and deletes of pending quests and recomputes on change', async () => {
        list.mockResolvedValue(requestList('changed'));

        publisher.onModuleInit();
        stream.emit('change', { operationType: 'delete' });
        await settle();

        expect(watch).toHaveBeenCalledWith([
            { $match: { operationType: { $in: ['insert', 'delete'] } } },
        ]);
        expect(publish).toHaveBeenCalledWith('pendingRequestsUpdated', {
            pendingRequestsUpdated: requestList('changed'),
        });
    });
});
