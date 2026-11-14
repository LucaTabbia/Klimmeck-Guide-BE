import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Types, type Model } from 'mongoose';
import type { CharacterDocument } from 'src/models/character/character.model';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import type { CharacterUpdatesPublisher } from '../character-updates.publisher';
import { MissionDraftLockPublisher } from './mission-draft-lock.publisher';

const SETTLE_TICKS = 10;

async function settle(): Promise<void> {
    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('MissionDraftLockPublisher', () => {
    let watch: jest.Mock;
    let find: jest.Mock;
    let holders: jest.Mock<Promise<{ _id: Types.ObjectId }[]>, []>;
    let requestPublish: jest.Mock;
    let stream: FakeChangeStream;
    let publisher: MissionDraftLockPublisher;

    const markOf = (pendingQuestId: Types.ObjectId, marker: Date | null) =>
        stream.emit('change', {
            operationType: 'update',
            documentKey: { _id: pendingQuestId },
            updateDescription: {
                updatedFields: { missionDraftStartedAt: marker },
            },
        });

    beforeEach(() => {
        stream = new FakeChangeStream();
        watch = jest.fn().mockReturnValue(stream);
        holders = jest.fn();
        find = jest.fn().mockReturnValue({ lean: () => ({ exec: holders }) });
        requestPublish = jest.fn();
        publisher = new MissionDraftLockPublisher(
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

    it.each([
        ['a draft starting', new Date('2026-11-14T10:00:00.000Z')],
        ['a draft discarded', null],
    ])(
        'republishes the active holders of the GM lanes (D-23): %s',
        async (_, marker) => {
            const pendingQuestId = new Types.ObjectId();
            const first = new Types.ObjectId();
            const second = new Types.ObjectId();
            holders.mockResolvedValueOnce([{ _id: first }, { _id: second }]);

            markOf(pendingQuestId, marker);
            await settle();

            const forms = [pendingQuestId, pendingQuestId.toHexString()];
            expect(find.mock.calls).toEqual([
                [
                    {
                        deletedAt: null,
                        $or: [
                            { 'quests.activeStoryQuest': { $in: forms } },
                            {
                                'quests.activeWorldMissionQuest': {
                                    $in: forms,
                                },
                            },
                        ],
                    },
                    { _id: 1 },
                ],
            ]);
            expect(requestPublish.mock.calls).toEqual([
                [first.toHexString()],
                [second.toHexString()],
            ]);
        },
    );

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

        markOf(pendingQuestId, null);
        await settle();

        expect(requestPublish).not.toHaveBeenCalled();
        const messages = error.mock.calls.map(([value]) => String(value));
        expect(messages).toEqual([
            `Ripubblicazione dei personaggi del flusso guidato ${pendingQuestId.toHexString()} fallita: Error, code 112`,
        ]);
    });

    it('does not republish holders read while the application was closing (D-23)', async () => {
        let resolveHolders: (value: { _id: Types.ObjectId }[]) => void = () =>
            undefined;
        holders.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveHolders = resolve;
            }),
        );

        markOf(new Types.ObjectId(), new Date());
        await publisher.onModuleDestroy();
        resolveHolders([{ _id: new Types.ObjectId() }]);
        await settle();

        expect(find).toHaveBeenCalledTimes(1);
        expect(requestPublish.mock.calls).toEqual([]);
    });

    it('does not read the holders once the application is closing (D-23)', async () => {
        await publisher.onModuleDestroy();
        const closing = publisher as unknown as {
            onChange(change: object): void;
        };

        closing.onChange({ documentKey: { _id: new Types.ObjectId() } });
        await settle();

        expect(find.mock.calls).toEqual([]);
    });
});
