import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Types, type Model } from 'mongoose';
import type { CharacterDocument } from 'src/models/character/character.model';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import type { CharacterUpdatesPublisher } from './character-updates.publisher';
import { PendingQuestStartPublisher } from './pending-quest-start.publisher';

const SETTLE_TICKS = 10;

async function settle(): Promise<void> {
    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('PendingQuestStartPublisher', () => {
    let watch: jest.Mock;
    let find: jest.Mock;
    let holders: jest.Mock<Promise<{ _id: Types.ObjectId }[]>, []>;
    let requestPublish: jest.Mock;
    let stream: FakeChangeStream;
    let publisher: PendingQuestStartPublisher;

    const startOf = (pendingQuestId: Types.ObjectId) =>
        stream.emit('change', {
            operationType: 'update',
            documentKey: { _id: pendingQuestId },
            updateDescription: { updatedFields: { startDate: new Date() } },
        });

    beforeEach(() => {
        stream = new FakeChangeStream();
        watch = jest.fn().mockReturnValue(stream);
        holders = jest.fn();
        find = jest.fn().mockReturnValue({ lean: () => ({ exec: holders }) });
        requestPublish = jest.fn();
        publisher = new PendingQuestStartPublisher(
            { watch } as unknown as Model<PendingQuestDocument>,
            { find } as unknown as Model<CharacterDocument>,
            { requestPublish } as unknown as CharacterUpdatesPublisher,
            { publish: jest.fn() } as unknown as PubSub<PubSubEvents>,
        );
        publisher.onModuleInit();
    });

    afterEach(async () => {
        await publisher.onModuleDestroy();
        jest.restoreAllMocks();
    });

    it('republishes the character whose standard lane started (D-22)', async () => {
        const pendingQuestId = new Types.ObjectId();
        const characterId = new Types.ObjectId();
        holders.mockResolvedValueOnce([{ _id: characterId }]);

        startOf(pendingQuestId);
        await settle();

        expect(find.mock.calls).toEqual([
            [
                {
                    deletedAt: null,
                    'quests.pendingQuest': {
                        $in: [pendingQuestId, pendingQuestId.toHexString()],
                    },
                },
                { _id: 1 },
            ],
        ]);
        expect(requestPublish.mock.calls).toEqual([
            [characterId.toHexString()],
        ]);
    });

    it('republishes every member of a party that started together (D-22)', async () => {
        const first = new Types.ObjectId();
        const second = new Types.ObjectId();
        holders.mockResolvedValueOnce([{ _id: first }, { _id: second }]);

        startOf(new Types.ObjectId());
        await settle();

        expect(requestPublish.mock.calls).toEqual([
            [first.toHexString()],
            [second.toHexString()],
        ]);
    });

    it('ignores a pending quest that no active character holds', async () => {
        holders.mockResolvedValueOnce([]);

        startOf(new Types.ObjectId());
        await settle();

        expect(find).toHaveBeenCalledTimes(1);
        expect(requestPublish).not.toHaveBeenCalled();
    });

    it('ignores an event without a document key', async () => {
        stream.emit('change', { operationType: 'update' });
        await settle();

        expect(find).not.toHaveBeenCalled();
        expect(requestPublish).not.toHaveBeenCalled();
    });

    it('logs the code of a failed read without republishing', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        holders.mockRejectedValueOnce(
            Object.assign(new Error('raw driver message'), { code: 112 }),
        );
        const pendingQuestId = new Types.ObjectId();

        startOf(pendingQuestId);
        await settle();

        expect(requestPublish).not.toHaveBeenCalled();
        const messages = error.mock.calls.map(([value]) => String(value));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(pendingQuestId.toHexString());
        expect(messages[0]).toContain('code 112');
        expect(messages[0]).not.toContain('raw driver message');
    });

    it('watches only the updates that write a start date (D-22)', () => {
        expect(watch.mock.calls).toEqual([
            [
                [
                    {
                        $match: {
                            operationType: 'update',
                            'updateDescription.updatedFields.startDate': {
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
