import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { mongo, Types, type Model } from 'mongoose';
import type { UserDocument } from 'src/models/user.model';
import type { ChangeStreamEvent } from 'src/mongo/change-stream-publisher';
import type { PubSubEvents } from 'src/pubsub.module';
import type { SessionRevocationService } from './session-revocation.service';
import {
    USER_ROLE_CHANGES,
    UserRoleChangesPublisher,
} from './user-role-changes.publisher';

type ChangeReceiver = { onChange(change: ChangeStreamEvent): void };

function controlledRevocation() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

describe('UserRoleChangesPublisher', () => {
    let revokeAllForRoleChange: jest.Mock;
    let receiver: ChangeReceiver;

    beforeEach(() => {
        revokeAllForRoleChange = jest.fn().mockResolvedValue(undefined);
        const publisher = new UserRoleChangesPublisher(
            {} as unknown as Model<UserDocument>,
            { revokeAllForRoleChange } as unknown as SessionRevocationService,
            {} as unknown as PubSub<PubSubEvents>,
        );
        receiver = publisher as unknown as ChangeReceiver;
    });

    afterEach(() => jest.restoreAllMocks());

    it('revokes the sessions of the user named by the event (D-06)', async () => {
        const userObjectId = new Types.ObjectId();

        receiver.onChange({ documentKey: { _id: userObjectId } });
        await new Promise(setImmediate);

        expect(
            revokeAllForRoleChange.mock.calls.map(([userId]) => userId),
        ).toEqual([userObjectId.toHexString()]);
    });

    it('limits the revocation to the sessions created up to the second of the event (D-06)', async () => {
        const userObjectId = new Types.ObjectId();
        const eventSeconds = 1_700_000_000;

        receiver.onChange({
            documentKey: { _id: userObjectId },
            clusterTime: new mongo.Timestamp({ t: eventSeconds, i: 3 }),
        });
        await new Promise(setImmediate);

        expect(revokeAllForRoleChange.mock.calls).toEqual([
            [
                userObjectId.toHexString(),
                { createdBefore: new Date((eventSeconds + 1) * 1000) },
            ],
        ]);
    });

    it('sets no limit when the event carries no cluster time (D-06)', async () => {
        const userObjectId = new Types.ObjectId();

        receiver.onChange({ documentKey: { _id: userObjectId } });
        await new Promise(setImmediate);

        expect(revokeAllForRoleChange.mock.calls).toEqual([
            [userObjectId.toHexString(), { createdBefore: undefined }],
        ]);
    });

    it('ignores an event without a document key (D-06)', () => {
        receiver.onChange({});

        expect(revokeAllForRoleChange).not.toHaveBeenCalled();
    });

    it('logs a failed revocation with the user id and the error name only (D-06)', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        revokeAllForRoleChange.mockRejectedValueOnce(
            new Error('token-abc-secret'),
        );
        const userObjectId = new Types.ObjectId();

        receiver.onChange({ documentKey: { _id: userObjectId } });
        await new Promise(setImmediate);

        expect(error).toHaveBeenCalledTimes(1);
        const [message] = error.mock.calls[0] as [string];
        expect(message).toContain(userObjectId.toHexString());
        expect(message).toContain('Error');
        expect(message).not.toContain('token-abc-secret');
    });

    it('starts the next revocation only after the previous one settled (D-06)', async () => {
        const first = controlledRevocation();
        revokeAllForRoleChange.mockReturnValueOnce(first.promise);

        receiver.onChange({ documentKey: { _id: new Types.ObjectId() } });
        receiver.onChange({ documentKey: { _id: new Types.ObjectId() } });
        await new Promise(setImmediate);

        expect(revokeAllForRoleChange).toHaveBeenCalledTimes(1);
        first.resolve();
        await new Promise(setImmediate);
        expect(revokeAllForRoleChange).toHaveBeenCalledTimes(2);
    });

    it('keeps revoking after a failed revocation (D-06)', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const first = controlledRevocation();
        revokeAllForRoleChange.mockReturnValueOnce(first.promise);
        const secondUser = new Types.ObjectId();

        receiver.onChange({ documentKey: { _id: new Types.ObjectId() } });
        receiver.onChange({ documentKey: { _id: secondUser } });
        first.reject(new Error('revocation failed'));
        await new Promise(setImmediate);

        expect(revokeAllForRoleChange).toHaveBeenCalledTimes(2);
        expect(revokeAllForRoleChange.mock.calls[1][0]).toBe(
            secondUser.toHexString(),
        );
    });

    it('watches only the updates that touch the role (D-06)', () => {
        expect(USER_ROLE_CHANGES.pipeline).toEqual([
            {
                $match: {
                    operationType: 'update',
                    'updateDescription.updatedFields.role': { $exists: true },
                },
            },
        ]);
        expect(USER_ROLE_CHANGES.options).toBeUndefined();
    });
});
