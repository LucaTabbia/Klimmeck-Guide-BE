import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import { MissionDraftQueueRefresher } from './mission-draft-queue.refresher';
import type { PendingRequestsPublisher } from './pending-requests.publisher';

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('MissionDraftQueueRefresher', () => {
    let requestRefresh: jest.Mock;
    let watch: jest.Mock;
    let stream: FakeChangeStream;
    let refresher: MissionDraftQueueRefresher;

    beforeEach(() => {
        requestRefresh = jest.fn();
        stream = new FakeChangeStream();
        watch = jest.fn().mockReturnValue(stream);
        refresher = new MissionDraftQueueRefresher(
            { watch } as unknown as Model<PendingQuestDocument>,
            { requestRefresh } as unknown as PendingRequestsPublisher,
            { publish: jest.fn() } as unknown as PubSub<PubSubEvents>,
        );
        refresher.onModuleInit();
    });

    afterEach(async () => {
        await refresher.onModuleDestroy();
        jest.restoreAllMocks();
    });

    it('watches the draft marker going on and off (D-23)', () => {
        expect(watch.mock.calls).toEqual([
            [
                [
                    {
                        $match: {
                            operationType: 'update',
                            'updateDescription.updatedFields.missionDraftStartedAt':
                                { $exists: true },
                        },
                    },
                ],
            ],
        ]);
    });

    it('refreshes the queue on a marker change and on a lost history (D-17)', () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );

        stream.emit('change', { operationType: 'update' });
        expect(requestRefresh).toHaveBeenCalledTimes(1);

        stream.emit('error', Object.assign(new Error('fake'), { code: 286 }));
        expect(requestRefresh).toHaveBeenCalledTimes(2);
    });
});
