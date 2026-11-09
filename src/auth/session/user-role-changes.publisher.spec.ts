import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Types, type Model } from 'mongoose';
import type { UserDocument } from 'src/models/user.model';
import type { ChangeStreamEvent } from 'src/mongo/change-stream-publisher';
import type { PubSubEvents } from 'src/pubsub.module';
import type { SessionRevocationService } from './session-revocation.service';
import {
    USER_ROLE_CHANGES,
    UserRoleChangesPublisher,
} from './user-role-changes.publisher';

type ChangeReceiver = { onChange(change: ChangeStreamEvent): void };

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

    it('revokes the sessions of the user named by the event (D-06)', () => {
        const userObjectId = new Types.ObjectId();

        receiver.onChange({ documentKey: { _id: userObjectId } });

        expect(revokeAllForRoleChange.mock.calls).toEqual([
            [userObjectId.toHexString()],
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
