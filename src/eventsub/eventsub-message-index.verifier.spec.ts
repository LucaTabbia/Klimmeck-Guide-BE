import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { EventSubMessageIndexVerifier } from 'src/eventsub/eventsub-message-index.verifier';
import { EventSubMessageDocument } from 'src/eventsub/eventsub-message.model';

describe('EventSubMessageIndexVerifier', () => {
    let createIndexes: jest.Mock;
    let error: jest.SpyInstance;
    let verifier: EventSubMessageIndexVerifier;

    beforeEach(() => {
        createIndexes = jest.fn();
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        verifier = new EventSubMessageIndexVerifier({
            createIndexes,
        } as unknown as Model<EventSubMessageDocument>);
    });

    afterEach(() => error.mockRestore());

    it('stays silent when the indexes are built', async () => {
        createIndexes.mockResolvedValue(undefined);

        await expect(
            verifier.onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(error).not.toHaveBeenCalled();
    });

    it('logs a duplicate-key failure without the message id and without blocking the boot', async () => {
        createIndexes.mockRejectedValue(
            Object.assign(
                new Error('E11000 dup key: { messageId: "msg-secret" }'),
                {
                    code: 11000,
                    name: 'MongoServerError',
                },
            ),
        );

        await expect(
            verifier.onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledTimes(1);
        const [message] = error.mock.calls[0] as [string];
        expect(message).toContain('eventsub_messages');
        expect(message).toContain('MongoServerError, code 11000');
        expect(message).not.toContain('msg-secret');
    });

    it('logs any other failure without blocking the boot', async () => {
        createIndexes.mockRejectedValue(new Error('network'));

        await expect(
            verifier.onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledTimes(1);
    });
});
