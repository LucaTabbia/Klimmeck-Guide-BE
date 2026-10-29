import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { User, UserDocument } from 'src/models/user.model';
import type { PubSubEvents } from 'src/pubsub.module';
import { UserUpdatesPublisher } from './user-updates.publisher';
import type { UsersService } from './users.service';

const SETTLE_TICKS = 10;
const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

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

function userState(id: string, displayName: string): User {
    return { _id: id, displayName } as unknown as User;
}

async function settle(): Promise<void> {
    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('UserUpdatesPublisher', () => {
    let findOne: jest.Mock<Promise<User>, [string]>;
    let publish: jest.Mock;
    let stream: FakeChangeStream;
    let publisher: UserUpdatesPublisher;

    const updateOf = (id: string) =>
        stream.emit('change', { fullDocument: { _id: id } });

    beforeEach(() => {
        findOne = jest.fn();
        publish = jest.fn().mockReturnValue(undefined);
        stream = new FakeChangeStream();
        publisher = new UserUpdatesPublisher(
            {
                watch: jest.fn().mockReturnValue(stream),
            } as unknown as Model<UserDocument>,
            { findOne } as unknown as UsersService,
            { publish } as unknown as PubSub<PubSubEvents>,
        );
        publisher.onModuleInit();
    });

    afterEach(async () => {
        await publisher.onModuleDestroy();
    });

    it('coalesces a burst on the same user into at most two reads (D-17a, WR-01)', async () => {
        findOne
            .mockResolvedValueOnce(userState(USER_ID, 'first'))
            .mockResolvedValueOnce(userState(USER_ID, 'last'));

        updateOf(USER_ID);
        updateOf(USER_ID);
        updateOf(USER_ID);
        await settle();

        expect(findOne).toHaveBeenCalledTimes(2);
    });

    it('publishes the latest user state after a burst', async () => {
        const stale = deferred<User>();
        const fresh = deferred<User>();
        findOne
            .mockReturnValueOnce(stale.promise)
            .mockReturnValueOnce(fresh.promise);

        updateOf(USER_ID);
        updateOf(USER_ID);
        await settle();
        fresh.resolve(userState(USER_ID, 'fresh'));
        await settle();
        stale.resolve(userState(USER_ID, 'stale'));
        await settle();

        expect(publish).toHaveBeenLastCalledWith('userUpdated', {
            userUpdated: userState(USER_ID, 'fresh'),
        });
    });

    it('keeps users independent', async () => {
        findOne
            .mockResolvedValueOnce(userState(USER_ID, 'one'))
            .mockResolvedValueOnce(userState(OTHER_USER_ID, 'other'));

        updateOf(USER_ID);
        updateOf(OTHER_USER_ID);
        await settle();

        expect(findOne.mock.calls).toEqual([[USER_ID], [OTHER_USER_ID]]);
        expect(publish.mock.calls).toEqual([
            ['userUpdated', { userUpdated: userState(USER_ID, 'one') }],
            ['userUpdated', { userUpdated: userState(OTHER_USER_ID, 'other') }],
        ]);
    });
});
