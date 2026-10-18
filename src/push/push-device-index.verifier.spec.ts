import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { PushDeviceIndexVerifier } from 'src/push/push-device-index.verifier';
import { PushDeviceDocument } from 'src/push/push-device.model';

describe('PushDeviceIndexVerifier', () => {
    let createIndexes: jest.Mock;
    let error: jest.SpyInstance;
    let verifier: PushDeviceIndexVerifier;

    beforeEach(() => {
        createIndexes = jest.fn();
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        verifier = new PushDeviceIndexVerifier({
            createIndexes,
        } as unknown as Model<PushDeviceDocument>);
    });

    afterEach(() => error.mockRestore());

    it('stays silent when the indexes are built', async () => {
        createIndexes.mockResolvedValue(undefined);

        await expect(
            verifier.onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(error).not.toHaveBeenCalled();
    });

    it('logs a duplicate-key failure without the token and without blocking the boot', async () => {
        createIndexes.mockRejectedValue(
            Object.assign(
                new Error('E11000 dup key: { token: "tok-secret" }'),
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
        expect(message).toContain('push_devices');
        expect(message).toContain('MongoServerError, code 11000');
        expect(message).not.toContain('tok-secret');
    });

    it('logs any other failure without blocking the boot', async () => {
        createIndexes.mockRejectedValue(new Error('network'));

        await expect(
            verifier.onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledTimes(1);
    });
});
