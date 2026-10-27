import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { CharacterCreationModule } from 'src/characters/creation/character-creation.module';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { User, UserDocument } from 'src/models/user.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestResultAcknowledgementService } from 'src/quests/results/quest-result-acknowledgement.service';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    expectSilence,
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
    withTimeout,
} from '../../../test/auth/ws-test-client';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistCharacter,
    persistCity,
    persistUser,
} from '../../../test/fixtures';
import { persistQuestResult } from '../../../test/quests/quest-result.fixture';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const CONFIRM =
    'mutation Confirm($id: String!) { acknowledgeQuestResult(id: $id) { response successful } }';
const ME = '{ me { currentCharacter { id } } }';
const CREATE_CHARACTER =
    'mutation { createCharacter(input: { name: "Aria", sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) { currentCharacter { id } } }';
const USER_UPDATED =
    'subscription { userUpdated { id currentCharacter { id } } }';
const CONFIRMED = { response: 'Risultato confermato', successful: true };
const SILENCE_WINDOW_MS = 1500;
const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface WireUser {
    id: string;
    currentCharacter: { id: string } | null;
}

type UserUpdatedResult = { userUpdated: WireUser };

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

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

// la morte tiene il personaggio corrente fino alla conferma del suo foglio, che lo stacca (D-12)
describe('death confirmation (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let results: Model<QuestResultDocument>;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let aliceCharId: Types.ObjectId;
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

    function call(
        document: string,
        bearer: string,
        variables?: Record<string, unknown>,
    ): Promise<request.Response> {
        return graphqlRequest(harness.app, document, variables, bearer);
    }

    function confirm(id: Types.ObjectId): Promise<request.Response> {
        return call(CONFIRM, alice.bearer, { id: String(id) });
    }

    function rawUser(id: Types.ObjectId) {
        return users.collection.findOne({ _id: id });
    }

    async function currentOnWire(player: TestPlayer): Promise<unknown> {
        const body = bodyOf(await call(ME, player.bearer));
        expect(body.errors).toBeUndefined();
        return (body.data?.me as { currentCharacter: unknown })
            .currentCharacter;
    }

    function die(player: TestPlayer): Promise<unknown> {
        return harness.connection.transaction((session) =>
            harness.app.get(CharacterArchiver).archiveWithin(session, {
                userId: player.user._id as Types.ObjectId,
                characterId: player.character!._id as Types.ObjectId,
                reason: DeletionReason.death,
                now: NOW,
            }),
        );
    }

    async function persistDeath(): Promise<Types.ObjectId> {
        await die(alice);
        const result = await persistQuestResult(results, {
            character: aliceCharId,
            user: alice.user._id,
            outcome: 'death',
        });
        return result._id as Types.ObjectId;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                QuestResultsModule,
                CharacterCreationModule,
                CharacterArchiveModule,
            ],
            clock: new FixedClock(NOW),
        });
        url = graphqlWsUrl(harness.port);
        users = harness.connection.model<UserDocument>(User.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        results = harness.connection.model<QuestResultDocument>(
            QuestResult.name,
        );
        // collection e indici pronti prima delle transazioni (Pitfall 9)
        await Promise.all(
            [
                User.name,
                Character.name,
                Quest.name,
                QuestResult.name,
                City.name,
                PointOfInterest.name,
            ].map((name) => harness.connection.model(name).init()),
        );
        await primeUsersChangeStream(harness);
    });

    beforeEach(async () => {
        await persistCity(
            harness.connection.model<CityDocument>(City.name),
            { type: 'drusteaCapital', name: 'Drustea' },
            harness.connection.model(PointOfInterest.name),
        );
        alice = await createPlayer(harness, { twitchId: 'twitch-death-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-death-bruno' });
        aliceCharId = alice.character!._id as Types.ObjectId;
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('keeps the dead character current until the death is confirmed', async () => {
        await persistDeath();

        expect(await currentOnWire(alice)).toEqual({
            id: String(aliceCharId),
        });
        expect((await rawUser(alice.user._id))?.currentCharacter).toEqual(
            aliceCharId,
        );
    });

    it('refuses a new character while the dead one is current', async () => {
        await persistDeath();

        const body = bodyOf(await call(CREATE_CHARACTER, alice.bearer));

        expect(body.errors?.[0]?.extensions?.code).toBe(
            'CHARACTER_ALREADY_EXISTS',
        );
        expect((await rawUser(alice.user._id))?.currentCharacter).toEqual(
            aliceCharId,
        );
    });

    it('unlinks the dead character when its death is confirmed', async () => {
        const deathId = await persistDeath();

        const body = bodyOf(await confirm(deathId));

        expect(body.errors).toBeUndefined();
        expect(body.data?.acknowledgeQuestResult).toEqual(CONFIRMED);
        expect((await rawUser(alice.user._id))?.currentCharacter).toBeNull();
        expect(await currentOnWire(alice)).toBeNull();
    });

    it('streams nothing at the death and the unlinked user once the death is confirmed', async () => {
        const subscription = subscribeAs(alice.bearer);
        expect((await nextUser(subscription)).currentCharacter).toEqual({
            id: String(aliceCharId),
        });

        const deathId = await persistDeath();
        await expectSilence(subscription, SILENCE_WINDOW_MS);

        await confirm(deathId);

        expect(await nextUser(subscription)).toEqual({
            id: String(alice.user._id),
            currentCharacter: null,
        });
    });

    it('allows a new character after the death is confirmed', async () => {
        const deathId = await persistDeath();
        await confirm(deathId);

        const body = bodyOf(await call(CREATE_CHARACTER, alice.bearer));

        expect(body.errors).toBeUndefined();
        const created = (
            body.data?.createCharacter as { currentCharacter: { id: string } }
        ).currentCharacter.id;
        expect(created).not.toBe(String(aliceCharId));
        expect(String((await rawUser(alice.user._id))?.currentCharacter)).toBe(
            created,
        );
    });

    it('never unlinks a different character', async () => {
        const deathId = await persistDeath();
        const alive = await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name: 'Nuova Alice' },
        });
        await users.updateOne(
            { _id: alice.user._id },
            { $set: { currentCharacter: alive._id } },
        );

        const body = bodyOf(await confirm(deathId));

        expect(body.data?.acknowledgeQuestResult).toEqual(CONFIRMED);
        expect((await rawUser(alice.user._id))?.currentCharacter).toEqual(
            alive._id,
        );
    });

    it('writes nothing on a second confirmation of the death', async () => {
        const deathId = await persistDeath();
        await confirm(deathId);
        const afterFirst = await rawUser(alice.user._id);

        const body = bodyOf(await confirm(deathId));

        expect(body.data?.acknowledgeQuestResult).toEqual(CONFIRMED);
        expect(await rawUser(alice.user._id)).toEqual(afterFirst);
    });

    it('unlinks nothing when a non-death result is confirmed', async () => {
        const success = await persistQuestResult(results, {
            character: bruno.character!._id,
            user: bruno.user._id,
            outcome: 'success',
        });

        const body = bodyOf(
            await call(CONFIRM, bruno.bearer, { id: String(success._id) }),
        );

        expect(body.data?.acknowledgeQuestResult).toEqual(CONFIRMED);
        expect((await rawUser(bruno.user._id))?.currentCharacter).toEqual(
            bruno.character!._id,
        );
    });

    it('unlinks once under two concurrent confirmations of the death', async () => {
        const deathId = await persistDeath();

        const bodies = (
            await Promise.all([confirm(deathId), confirm(deathId)])
        ).map(bodyOf);

        for (const body of bodies) {
            expect(body.data?.acknowledgeQuestResult).toEqual(CONFIRMED);
        }
        expect((await rawUser(alice.user._id))?.currentCharacter).toBeNull();

        await die(bruno);
        const brunoDeath = await persistQuestResult(results, {
            character: bruno.character!._id,
            user: bruno.user._id,
            outcome: 'death',
        });
        const service = harness.app.get(QuestResultAcknowledgementService);
        const brunoId = bruno.user._id as Types.ObjectId;
        const written = await Promise.all([
            service.acknowledge(brunoDeath._id as Types.ObjectId, brunoId),
            service.acknowledge(brunoDeath._id as Types.ObjectId, brunoId),
        ]);
        expect([...written].sort()).toEqual([false, true]);
        expect((await rawUser(brunoId))?.currentCharacter).toBeNull();
    });
});
