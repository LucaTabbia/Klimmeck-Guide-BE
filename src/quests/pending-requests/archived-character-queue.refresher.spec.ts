import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { CharacterDocument } from 'src/models/character/character.model';
import type { PubSubEvents } from 'src/pubsub.module';
import { ArchivedCharacterQueueRefresher } from './archived-character-queue.refresher';
import type { PendingRequestsPublisher } from './pending-requests.publisher';

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('ArchivedCharacterQueueRefresher', () => {
    let requestRefresh: jest.Mock;
    let watch: jest.Mock;
    let stream: FakeChangeStream;
    let refresher: ArchivedCharacterQueueRefresher;

    beforeEach(() => {
        requestRefresh = jest.fn();
        stream = new FakeChangeStream();
        watch = jest.fn().mockReturnValue(stream);
        refresher = new ArchivedCharacterQueueRefresher(
            { watch } as unknown as Model<CharacterDocument>,
            { requestRefresh } as unknown as PendingRequestsPublisher,
            { publish: jest.fn() } as unknown as PubSub<PubSubEvents>,
        );
        refresher.onModuleInit();
    });

    afterEach(async () => {
        await refresher.onModuleDestroy();
    });

    it('asks the queue to refresh when a character is archived (D-23)', () => {
        stream.emit('change', { operationType: 'update' });

        expect(requestRefresh).toHaveBeenCalledTimes(1);
    });

    it('watches only the updates that set the archive date (D-23)', () => {
        expect(watch.mock.calls).toEqual([
            [
                [
                    {
                        $match: {
                            operationType: 'update',
                            'updateDescription.updatedFields.deletedAt': {
                                $exists: true,
                                $ne: null,
                            },
                        },
                    },
                ],
            ],
        ]);
    });
});
