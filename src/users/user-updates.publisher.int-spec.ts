import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { User, UserDocument } from 'src/models/user.model';
import { documentIdOf } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { UserUpdatesPublisher } from 'src/users/user-updates.publisher';
import { UsersService } from 'src/users/users.service';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { withTimeout } from '../../test/auth/ws-test-client';
import { createPlayer } from '../../test/authz/player-fixture';
import {
    buildCharacter,
    persistCharacter,
    persistUser,
} from '../../test/fixtures';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;
const BARRIER_POINTS = -1;
const POLL_INTERVAL_MS = 50;
const POLL_LIMIT_MS = 5000;

type UserUpdatedPayload = PubSubEvents['userUpdated'][0];

interface PopulatedCharacter {
    _id?: unknown;
    infos: { name: string };
}

async function waitUntil(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + POLL_LIMIT_MS;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error('condition not met');
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

describe('UserUpdatesPublisher (change stream on users)', () => {
    let harness: AuthTestApp;
    let pubSub: PubSub<PubSubEvents>;
    let users: Model<UserDocument>;
    let live: AsyncIterableIterator<UserUpdatedPayload>;
    let pending: Promise<IteratorResult<UserUpdatedPayload>> | undefined;
    let sentinel: UserDocument;

    // un solo next() pendente alla volta: un timeout non perde l'evento, lo consegna alla chiamata successiva
    async function nextEvent(timeoutMs = 5000): Promise<User> {
        pending ??= live.next();
        const result = await withTimeout(pending, timeoutMs);
        pending = undefined;
        if (result.done) throw new Error('userUpdated stream ended');
        return result.value.userUpdated;
    }

    async function touchSentinel(twitchPoints: number): Promise<void> {
        await users.updateOne(
            { _id: sentinel._id },
            { $set: { twitchPoints } },
        );
    }

    function isSentinel(user: User): boolean {
        return documentIdOf(user) === String(sentinel._id);
    }

    // l'evento con un valore marcatore arriva dopo tutti quelli precedenti: tutto ciò che sta prima si scarta
    async function flushUntilBarrier(): Promise<void> {
        await touchSentinel(BARRIER_POINTS);
        for (;;) {
            const user = await nextEvent();
            if (isSentinel(user) && user.twitchPoints === BARRIER_POINTS)
                return;
        }
    }

    // Pitfall 9: il cursore del change stream si apre in modo asincrono, si scrive finché un evento arriva
    async function primeChangeStream(): Promise<void> {
        sentinel = (await persistUser(users, {
            twitchId: 'twitch-sentinel',
        })) as UserDocument;
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await touchSentinel(attempt);
            const received = await nextEvent(PRIMING_WAIT_MS).catch(
                () => undefined,
            );
            if (received && isSentinel(received)) {
                await flushUntilBarrier();
                return;
            }
        }
        throw new Error('change stream on users never delivered an event');
    }

    function characterModel(): Model<CharacterDocument> {
        return (harness.connection.models[Character.name] ??
            harness.connection.model(
                Character.name,
                CharacterSchema,
            )) as Model<CharacterDocument>;
    }

    function poiModel(): Model<PointOfInterest> {
        return (harness.connection.models[PointOfInterest.name] ??
            harness.connection.model(
                PointOfInterest.name,
                PointOfInterestSchema,
            )) as Model<PointOfInterest>;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp();
        pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        users = harness.connection.model<UserDocument>(User.name);
        await Promise.all([users.init(), characterModel().init()]);
    });

    beforeEach(async () => {
        live = pubSub.subscribe('userUpdated');
        pending = undefined;
        await primeChangeStream();
    });

    afterEach(async () => {
        await live.return?.();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('publishes the whole user with currentCharacter populated when a user changes', async () => {
        const { user, character } = await createPlayer(harness, {
            twitchId: 'twitch-pub-1',
        });

        await users.updateOne({ _id: user._id }, { $set: { twitchPoints: 5 } });

        const received = await nextEvent();
        expect(documentIdOf(received)).toBe(String(user._id));
        expect(received.twitchPoints).toBe(5);
        const populated = received.currentCharacter as PopulatedCharacter;
        expect(documentIdOf(populated)).toBe(String(character?._id));
        expect(populated.infos.name).toBe('Eroe twitch-pub-1');
    });

    it('publishes nothing for the no-op upserts of a login on an existing user', async () => {
        await createPlayer(harness, { twitchId: 'twitch-pub-1' });
        const usersService = harness.app.get(UsersService);

        await usersService.findOrCreateByTwitchId('twitch-pub-1');
        await usersService.upsertWithRole('twitch-pub-1', RoleType.adventurer);
        await touchSentinel(1000);

        const received = await nextEvent();
        expect(isSentinel(received)).toBe(true);
        expect(received.twitchPoints).toBe(1000);
    });

    it('publishes a role changed by hand on the database', async () => {
        const { user } = await createPlayer(harness, {
            twitchId: 'twitch-pub-1',
        });

        await users.updateOne(
            { _id: user._id },
            { $set: { role: 'innkeeper' } },
        );

        const received = await nextEvent();
        expect(documentIdOf(received)).toBe(String(user._id));
        expect(received.role).toBe('innkeeper');
    });

    it('publishes a write committed inside a transaction', async () => {
        const { user } = await createPlayer(harness, {
            twitchId: 'twitch-pub-1',
            withCharacter: false,
        });
        const newCharacter = await persistCharacter(
            characterModel(),
            { infos: { ...buildCharacter().infos, name: 'Eroe nuovo' } },
            poiModel(),
        );

        await harness.connection.transaction((session) =>
            users
                .updateOne(
                    { _id: user._id },
                    { $set: { currentCharacter: newCharacter._id } },
                    { session },
                )
                .then(() => undefined),
        );

        const received = await nextEvent();
        expect(documentIdOf(received)).toBe(String(user._id));
        expect(documentIdOf(received.currentCharacter)).toBe(
            String(newCharacter._id),
        );
    });

    it('logs a failed load without user data and keeps the stream alive', async () => {
        const { user } = await createPlayer(harness, {
            twitchId: 'twitch-pub-1',
        });
        const findOne = jest
            .spyOn(harness.app.get(UsersService), 'findOne')
            .mockRejectedValueOnce(new Error('boom'));
        const errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        try {
            await users.updateOne(
                { _id: user._id },
                { $set: { twitchPoints: 1 } },
            );
            await waitUntil(() =>
                errorSpy.mock.calls.some((call) =>
                    String(call[0]).includes('userUpdated'),
                ),
            );
            expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
                'twitch-pub-1',
            );

            await users.updateOne(
                { _id: user._id },
                { $set: { twitchPoints: 2 } },
            );
            const received = await nextEvent();
            expect(documentIdOf(received)).toBe(String(user._id));
            expect(received.twitchPoints).toBe(2);
        } finally {
            findOne.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('closes the change stream when the application shuts down', async () => {
        const local = await createAuthTestApp();
        const publisher = local.app.get(UserUpdatesPublisher);
        const stream = (
            publisher as unknown as {
                changeStream: { close(): Promise<void> };
            }
        ).changeStream;
        const close = jest.spyOn(stream, 'close');

        // solo app.close(): dropDatabase invaliderebbe anche lo stream dell'harness condiviso
        await local.app.close();

        expect(close).toHaveBeenCalledTimes(1);
    });
});
