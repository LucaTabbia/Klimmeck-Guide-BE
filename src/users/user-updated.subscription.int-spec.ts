import { GraphQLSchemaHost } from '@nestjs/graphql';
import type { PubSub } from '@graphql-yoga/subscription';
import { printSchema } from 'graphql';
import type { Model } from 'mongoose';
import { CharacterCreationModule } from 'src/characters/creation/character-creation.module';
import { Character } from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { User, UserDocument } from 'src/models/user.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
    withTimeout,
} from '../../test/auth/ws-test-client';
import { createPlayer } from '../../test/authz/player-fixture';
import { persistCity, persistUser } from '../../test/fixtures';

const USER_UPDATED =
    'subscription { userUpdated { id twitchId twitchPoints role currentCharacter { id } } }';

const CREATE_CHARACTER =
    'mutation { createCharacter(input: { name: "Aria", sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) { currentCharacter { id } } }';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;

interface WireUser {
    id: string;
    twitchId: string;
    twitchPoints: number;
    role: string;
    currentCharacter: { id: string } | null;
}

type UserUpdatedResult = { userUpdated: WireUser };

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si scrive finché un evento arriva
async function primeUsersChangeStream(harness: AuthTestApp): Promise<void> {
    const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
    const users = harness.connection.model<UserDocument>(User.name);
    const sentinel = await persistUser(users, { twitchId: 'twitch-sentinel' });
    const live = pubSub.subscribe('userUpdated');
    const received = live.next();
    try {
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await users.updateOne(
                { _id: sentinel._id },
                { $set: { twitchPoints: attempt } },
            );
            const delivered = await withTimeout(
                received,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (delivered) return;
        }
        throw new Error('change stream on users never delivered an event');
    } finally {
        await live.return?.();
        await harness.clearDatabase();
    }
}

describe('userUpdated subscription (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let users: Model<UserDocument>;
    let cities: Model<CityDocument>;
    let pois: Model<PointOfInterest>;
    const opened: OpenSubscription<UserUpdatedResult>[] = [];

    function subscribeAs(bearer: string): OpenSubscription<UserUpdatedResult> {
        const subscription = openSubscription<UserUpdatedResult>(
            url,
            { Authorization: bearer },
            { query: USER_UPDATED },
        );
        opened.push(subscription);
        return subscription;
    }

    async function nextUser(
        subscription: OpenSubscription<UserUpdatedResult>,
    ): Promise<WireUser> {
        const result = await subscription.next();
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.userUpdated as WireUser;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [CharacterCreationModule],
        });
        url = graphqlWsUrl(harness.port);
        users = harness.connection.model<UserDocument>(User.name);
        cities = harness.connection.model<CityDocument>(City.name);
        pois = harness.connection.model<PointOfInterest>(PointOfInterest.name);
        // indici e collection prima delle transazioni
        await Promise.all(
            [User.name, Character.name, City.name, PointOfInterest.name].map(
                (name) => harness.connection.model(name).init(),
            ),
        );
        await primeUsersChangeStream(harness);
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('sends the current user as a snapshot on subscribe', async () => {
        const { user, character, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-sub-1',
        });

        const result = await subscribeAs(bearer).next();

        expect(result).toEqual({
            done: false,
            value: {
                data: {
                    userUpdated: {
                        id: String(user._id),
                        twitchId: 'twitch-sub-1',
                        twitchPoints: 0,
                        role: 'adventurer',
                        currentCharacter: { id: String(character?._id) },
                    },
                },
            },
        });
    });

    it('streams later changes of the user', async () => {
        const { user, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-sub-1',
        });
        const subscription = subscribeAs(bearer);
        await nextUser(subscription);

        await users.updateOne({ _id: user._id }, { $set: { twitchPoints: 7 } });

        expect((await nextUser(subscription)).twitchPoints).toBe(7);
    });

    it("never delivers another user's changes", async () => {
        const playerA = await createPlayer(harness, {
            twitchId: 'twitch-sub-a',
        });
        const playerB = await createPlayer(harness, {
            twitchId: 'twitch-sub-b',
        });
        const subscription = subscribeAs(playerA.bearer);
        await nextUser(subscription);

        await users.updateOne(
            { _id: playerB.user._id },
            { $set: { twitchPoints: 3 } },
        );
        await users.updateOne(
            { _id: playerA.user._id },
            { $set: { twitchPoints: 9 } },
        );

        const received = await nextUser(subscription);
        expect(received.id).toBe(String(playerA.user._id));
        expect(received.twitchPoints).toBe(9);
    });

    it('sends the state changed while disconnected when subscribing again', async () => {
        const { user, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-sub-1',
        });
        const first = subscribeAs(bearer);
        await nextUser(first);
        await first.dispose();

        await users.updateOne(
            { _id: user._id },
            { $set: { twitchPoints: 11 } },
        );

        expect((await nextUser(subscribeAs(bearer))).twitchPoints).toBe(11);
    });

    it('streams the new currentCharacter after createCharacter', async () => {
        const { bearer } = await createPlayer(harness, {
            twitchId: 'twitch-sub-new',
            withCharacter: false,
        });
        const subscription = subscribeAs(bearer);
        expect((await nextUser(subscription)).currentCharacter).toBeNull();
        await persistCity(
            cities,
            { type: 'drusteaCapital', name: 'Drustea' },
            pois,
        );

        const response = await graphqlRequest(
            harness.app,
            CREATE_CHARACTER,
            undefined,
            bearer,
        );

        const body = response.body as {
            data?: { createCharacter?: { currentCharacter: { id: string } } };
            errors?: unknown[];
        };
        expect(body.errors).toBeUndefined();
        const createdId = body.data?.createCharacter?.currentCharacter.id;
        expect(createdId).toBeDefined();
        expect((await nextUser(subscription)).currentCharacter).toEqual({
            id: createdId,
        });
    });

    it('streams a role changed by hand on the database', async () => {
        const { user, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-sub-1',
        });
        const subscription = subscribeAs(bearer);
        await nextUser(subscription);

        await users.updateOne(
            { _id: user._id },
            { $set: { role: 'innkeeper' } },
        );

        expect((await nextUser(subscription)).role).toBe('innkeeper');
    });

    it('exposes userUpdated without arguments', () => {
        const schema = printSchema(harness.app.get(GraphQLSchemaHost).schema);

        expect(schema).toContain('userUpdated: User!');
        expect(schema).not.toMatch(/userUpdated\(/);
    });

    it('delivers the same events to two subscriptions of the same user', async () => {
        const { user, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-sub-1',
        });
        const phone = subscribeAs(bearer);
        const tablet = subscribeAs(bearer);
        const snapshots = await Promise.all([
            nextUser(phone),
            nextUser(tablet),
        ]);
        expect(snapshots.map(({ id }) => id)).toEqual([
            String(user._id),
            String(user._id),
        ]);

        await users.updateOne({ _id: user._id }, { $set: { twitchPoints: 4 } });

        const events = await Promise.all([nextUser(phone), nextUser(tablet)]);
        expect(events.map(({ twitchPoints }) => twitchPoints)).toEqual([4, 4]);
    });
});
