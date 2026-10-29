import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import { CharacterCreationModule } from 'src/characters/creation/character-creation.module';
import { CharacterDeletionModule } from 'src/characters/deletion/character-deletion.module';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestsModule } from 'src/quests/quests.module';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createAuthenticatedUser } from '../../../test/auth/test-tokens';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
    withTimeout,
} from '../../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';

const DELETE_CHARACTER =
    'mutation { deleteCharacter { id twitchId twitchPoints role currentCharacter { id } } }';

const DELETE_CHARACTER_WITH_ID =
    'mutation { deleteCharacter(id: "64b0000000000000000000aa") { id } }';

const CREATE_CHARACTER = `
    mutation Create($name: String!) {
        createCharacter(input: { name: $name, sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) {
            currentCharacter { id }
        }
    }
`;

const CHARACTER_QUERY = 'query($id: String!) { character(id: $id) { id } }';

const QUESTS_QUERY = 'query { quests { id } }';

const USER_UPDATED =
    'subscription { userUpdated { id currentCharacter { id } } }';

// l'archivio prende l'istante dall'orologio del server: con un orologio fisso le date scritte sono esatte
const NOW = new Date('2026-10-27T12:00:00.000Z');

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;

interface WireError {
    message: string;
    extensions?: { code?: string };
}

interface WireUser {
    id: string;
    twitchId: string;
    twitchPoints: number;
    role: string;
    currentCharacter: { id: string } | null;
}

interface WireBody {
    data?: Record<string, any> | null;
    errors?: WireError[];
}

type UserUpdatedResult = {
    userUpdated: { id: string; currentCharacter: { id: string } | null };
};

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

describe('deleteCharacter (wire)', () => {
    let harness: AuthTestApp;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let cities: Model<CityDocument>;
    let pois: Model<PointOfInterest>;
    let quests: Model<QuestDocument>;
    const opened: OpenSubscription<UserUpdatedResult>[] = [];

    async function call(
        query: string,
        bearer?: string,
        variables?: Record<string, unknown>,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            query,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    function deleteAs(bearer?: string): Promise<WireBody> {
        return call(DELETE_CHARACTER, bearer);
    }

    function createCharacterNamed(
        name: string,
        bearer: string,
    ): Promise<WireBody> {
        return call(CREATE_CHARACTER, bearer, { name });
    }

    function deletedUserOf(body: WireBody): WireUser {
        expect(body.errors).toBeUndefined();
        return body.data?.deleteCharacter as WireUser;
    }

    function errorCodeOf(body: WireBody): string | undefined {
        return body.errors?.[0]?.extensions?.code;
    }

    function rawCharacter(id: string | Types.ObjectId) {
        return characters.collection.findOne({
            _id: new Types.ObjectId(String(id)),
        });
    }

    function rawUser(id: string | Types.ObjectId) {
        return users.collection.findOne({
            _id: new Types.ObjectId(String(id)),
        });
    }

    function archivedCount(): Promise<number> {
        return characters.countDocuments({ deletedAt: { $ne: null } });
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            imports: [
                CharacterDeletionModule,
                CharacterCreationModule,
                QuestsModule,
            ],
            clock: new FixedClock(NOW),
        });
        users = harness.connection.model<UserDocument>(User.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        cities = harness.connection.model<CityDocument>(City.name);
        pois = harness.connection.model<PointOfInterest>(PointOfInterest.name);
        quests = harness.connection.model<QuestDocument>(Quest.name);
        // indici e collection prima delle transazioni (Pitfall 9)
        await Promise.all(
            [
                User.name,
                Character.name,
                City.name,
                PointOfInterest.name,
                Quest.name,
            ].map((name) => harness.connection.model(name).init()),
        );
        await primeUsersChangeStream(harness);
    });

    beforeEach(async () => {
        await persistCity(
            cities,
            { type: 'drusteaCapital', name: 'Drustea' },
            pois,
        );
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('archives the current character and returns the unlinked user', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });
        const aliceCharId = String(alice.character?._id);
        await users.updateOne(
            { _id: alice.user._id },
            { $set: { twitchPoints: 1234 } },
        );
        const before = await rawCharacter(aliceCharId);

        const body = await deleteAs(alice.bearer);

        expect(deletedUserOf(body)).toMatchObject({
            id: String(alice.user._id),
            twitchPoints: 1234,
            currentCharacter: null,
        });
        const archived = await rawCharacter(aliceCharId);
        expect(archived?.deletedAt).toEqual(NOW);
        expect(archived?.deletionReason).toBe('user_request');
        expect(archived?.infos).toEqual(before?.infos);
        expect(archived?.status).toEqual(before?.status);
        expect(archived?.quests).toEqual(before?.quests);
        expect(archived?.assets).toEqual(before?.assets);
        expect((await rawUser(alice.user._id))?.currentCharacter).toBeNull();
        expect(
            await harness.connection
                .collection('admin_audit_logs')
                .countDocuments(),
        ).toBe(0);
    });

    it('answers CHARACTER_NOT_FOUND on a second call and writes nothing', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });
        const aliceCharId = String(alice.character?._id);
        deletedUserOf(await deleteAs(alice.bearer));
        const firstDeletedAt = (await rawCharacter(aliceCharId))?.deletedAt;

        const body = await deleteAs(alice.bearer);

        expect(body.data).toBeNull();
        expect(body.errors?.[0].extensions).toEqual({
            code: 'CHARACTER_NOT_FOUND',
        });
        expect(body.errors?.[0].message).toBe(
            'Non hai un personaggio da eliminare',
        );
        expect((await rawCharacter(aliceCharId))?.deletedAt).toEqual(
            firstDeletedAt,
        );
    });

    it('answers CHARACTER_NOT_FOUND to a user without a character', async () => {
        const { bearer } = await createPlayer(harness, {
            twitchId: 'twitch-del-empty',
            withCharacter: false,
        });

        const body = await deleteAs(bearer);

        expect(body.errors?.[0].extensions).toEqual({
            code: 'CHARACTER_NOT_FOUND',
        });
        expect(await archivedCount()).toBe(0);
    });

    it('archives exactly once under concurrent calls', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });

        const bodies = await Promise.all([
            deleteAs(alice.bearer),
            deleteAs(alice.bearer),
            deleteAs(alice.bearer),
        ]);

        const winners = bodies.filter((body) => body.errors === undefined);
        const losers = bodies.filter((body) => body.errors !== undefined);
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(2);
        for (const loser of losers) {
            expect(loser.errors?.[0].extensions).toEqual({
                code: 'CHARACTER_NOT_FOUND',
            });
        }
        expect(await archivedCount()).toBe(1);
        expect((await rawUser(alice.user._id))?.currentCharacter).toBeNull();
    });

    it('rejects an anonymous call with UNAUTHENTICATED', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });

        const body = await deleteAs();

        expect(errorCodeOf(body)).toBe('UNAUTHENTICATED');
        expect(
            (await rawCharacter(String(alice.character?._id)))?.deletedAt,
        ).toBeNull();
    });

    it('rejects a valid bearer whose user no longer exists with UNAUTHENTICATED', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });
        await users.deleteOne({ _id: alice.user._id });

        const body = await deleteAs(alice.bearer);

        expect(errorCodeOf(body)).toBe('UNAUTHENTICATED');
        expect(
            (await rawCharacter(String(alice.character?._id)))?.deletedAt,
        ).toBeNull();
    });

    it('refuses any argument', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });

        const body = await call(DELETE_CHARACTER_WITH_ID, alice.bearer);

        expect(errorCodeOf(body)).toBe('GRAPHQL_VALIDATION_FAILED');
        expect(await archivedCount()).toBe(0);
    });

    it('unlinks a user pointing at a missing character and warns', async () => {
        const warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { user, bearer } = await createAuthenticatedUser(harness, {
            twitchId: 'twitch-del-dangling',
            role: RoleType.adventurer,
            currentCharacter: new Types.ObjectId(),
        });

        const body = await deleteAs(bearer);

        expect(deletedUserOf(body).currentCharacter).toBeNull();
        expect((await rawUser(user._id))?.currentCharacter).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(String(user._id)),
        );
    });

    it('unlinks a user pointing at an already archived character without touching it', async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        const d0 = new Date('2026-01-01T00:00:00.000Z');
        const bob = await createPlayer(harness, {
            twitchId: 'twitch-del-bob',
            characterOverrides: { deletedAt: d0, deletionReason: 'death' },
        });

        const body = await deleteAs(bob.bearer);

        expect(deletedUserOf(body).currentCharacter).toBeNull();
        const raw = await rawCharacter(String(bob.character?._id));
        expect(raw?.deletedAt).toEqual(d0);
        expect(raw?.deletionReason).toBe('death');
    });

    it('keeps the pending quest on the archived character', async () => {
        const pq = new Types.ObjectId();
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
            characterOverrides: {
                quests: { ...buildCharacter().quests, pendingQuest: pq },
            },
        });

        deletedUserOf(await deleteAs(alice.bearer));

        const raw = await rawCharacter(String(alice.character?._id));
        expect(raw?.quests.pendingQuest).toEqual(pq);
    });

    it('frees the name for a new character of the same user', async () => {
        const { bearer } = await createPlayer(harness, {
            twitchId: 'twitch-del-aria',
            withCharacter: false,
        });
        const created = await createCharacterNamed('Aria', bearer);
        expect(created.errors).toBeUndefined();
        const oldId = created.data?.createCharacter.currentCharacter
            .id as string;
        deletedUserOf(await deleteAs(bearer));

        const recreated = await createCharacterNamed('aria', bearer);

        expect(recreated.errors).toBeUndefined();
        const newId = recreated.data?.createCharacter.currentCharacter.id;
        expect(newId).toBeDefined();
        expect(newId).not.toBe(oldId);
        expect(
            await characters.countDocuments({
                'infos.name': { $in: ['Aria', 'aria'] },
            }),
        ).toBe(2);
        const other = await createPlayer(harness, {
            twitchId: 'twitch-del-other',
            withCharacter: false,
        });
        const collision = await createCharacterNamed('ARIA', other.bearer);
        expect(errorCodeOf(collision)).toBe('CHARACTER_NAME_TAKEN');
    });

    it('makes the archived character invisible to its former owner', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });
        deletedUserOf(await deleteAs(alice.bearer));

        const body = await call(CHARACTER_QUERY, alice.bearer, {
            id: String(alice.character?._id),
        });

        expect(body.errors?.[0].extensions).toEqual({ code: 'NOT_FOUND' });
    });

    it('streams the unlinked user on userUpdated', async () => {
        const alice = await createPlayer(harness, {
            twitchId: 'twitch-del-alice',
        });
        const aliceCharId = String(alice.character?._id);
        const subscription = openSubscription<UserUpdatedResult>(
            graphqlWsUrl(harness.port),
            { Authorization: alice.bearer },
            { query: USER_UPDATED },
        );
        opened.push(subscription);
        const snapshot = await subscription.next();
        expect(snapshot.value.data?.userUpdated.currentCharacter).toEqual({
            id: aliceCharId,
        });

        deletedUserOf(await deleteAs(alice.bearer));

        const update = await subscription.next(5000);
        expect(update.done).toBe(false);
        expect(update.value.errors).toBeUndefined();
        expect(update.value.data?.userUpdated).toEqual({
            id: String(alice.user._id),
            currentCharacter: null,
        });
    });

    describe('seat release (D-30)', () => {
        function persistRegisteredQuest(
            type: string,
            registeredAdventurers: {
                character: Types.ObjectId;
                title: string;
            }[],
        ) {
            const base = buildQuest();
            return persistQuest(quests, {
                infos: { ...base.infos, type },
                registeredAdventurers,
            });
        }

        function rawSeats(id: Types.ObjectId) {
            return quests.collection
                .findOne({ _id: id })
                .then((quest) => quest?.registeredAdventurers);
        }

        function activeTravel(): Record<string, unknown> {
            const startTime = new Date('2026-10-21T10:00:00.000Z');
            return {
                road: {
                    coordinates: [
                        [0, 0],
                        [0, 0.2],
                    ],
                    distance: 0.44,
                },
                startTime,
                endTime: new Date(startTime.getTime() + 3_600_000),
                duration: 3_600_000,
                to: new Types.ObjectId(),
                kind: 'free',
            };
        }

        it('frees the seats of the deleted character on every quest', async () => {
            const alice = await createPlayer(harness, {
                twitchId: 'twitch-del-alice',
            });
            const deleted = alice.character?._id as Types.ObjectId;
            const other = new Types.ObjectId();
            const seats = [
                { character: deleted, title: 'rookie' },
                { character: other, title: 'hero' },
            ];
            const enemy = await persistRegisteredQuest('enemy', seats);
            const worldMission = await persistRegisteredQuest(
                'worldMission',
                seats,
            );
            const untouched = await persistRegisteredQuest('boss', [
                { character: other, title: 'hero' },
            ]);

            deletedUserOf(await deleteAs(alice.bearer));

            for (const quest of [enemy, worldMission, untouched]) {
                expect(await rawSeats(quest._id)).toEqual([
                    { character: other, title: 'hero' },
                ]);
            }
        });

        it('keeps the seat of the deleted character on a started quest («Il BE non libera i posti delle quest avviate»)', async () => {
            const alice = await createPlayer(harness, {
                twitchId: 'twitch-del-alice',
            });
            const bob = await createPlayer(harness, {
                twitchId: 'twitch-del-bob',
            });
            const deleted = alice.character?._id as Types.ObjectId;
            const kept = bob.character?._id as Types.ObjectId;
            const seats = [
                { character: deleted, title: 'rookie' },
                { character: kept, title: 'rookie' },
            ];
            const boss = await persistRegisteredQuest('boss', seats);
            await quests.updateOne(
                { _id: boss._id },
                { $set: { startedAt: new Date('2026-10-21T10:00:00.000Z') } },
            );
            const enemy = await persistRegisteredQuest('enemy', seats);

            deletedUserOf(await deleteAs(alice.bearer));

            const held = await rawSeats(boss._id);
            expect(held).toHaveLength(2);
            const [placeholder, other] = held;
            expect(Object.keys(placeholder).sort()).toEqual([
                'archivedAt',
                'character',
                'title',
            ]);
            expect(placeholder.character).toEqual(deleted);
            expect(placeholder.archivedAt).toEqual(NOW);
            expect((await rawCharacter(deleted))?.deletedAt).toEqual(NOW);
            expect(other).toEqual({ character: kept, title: 'rookie' });
            expect(await rawSeats(enemy._id)).toEqual([
                { character: kept, title: 'rookie' },
            ]);
        });

        it('leaves the quests untouched when the deletion is rejected', async () => {
            const { bearer } = await createPlayer(harness, {
                twitchId: 'twitch-del-empty',
                withCharacter: false,
            });
            const someone = new Types.ObjectId();
            const quest = await persistRegisteredQuest('enemy', [
                { character: someone, title: 'rookie' },
            ]);

            const body = await deleteAs(bearer);

            expect(errorCodeOf(body)).toBe('CHARACTER_NOT_FOUND');
            expect(await rawSeats(quest._id)).toEqual([
                { character: someone, title: 'rookie' },
            ]);
        });

        it('keeps the pending quest and the active travel on the archived character', async () => {
            const pq = new Types.ObjectId();
            const travel = activeTravel();
            const base = buildCharacter();
            const alice = await createPlayer(harness, {
                twitchId: 'twitch-del-alice',
                characterOverrides: {
                    status: { ...base.status, activeTravel: travel },
                    quests: { ...base.quests, pendingQuest: pq },
                },
            });
            const deleted = alice.character?._id as Types.ObjectId;
            const quest = await persistRegisteredQuest('enemy', [
                { character: deleted, title: 'rookie' },
            ]);

            deletedUserOf(await deleteAs(alice.bearer));

            const raw = await rawCharacter(deleted);
            expect(raw?.deletedAt).toBeInstanceOf(Date);
            expect(raw?.quests.pendingQuest).toEqual(pq);
            expect(raw?.status.activeTravel).toEqual(travel);
            expect(await rawSeats(quest._id)).toEqual([]);
        });

        it('closes the aids left without wounded and keeps the shared ones open', async () => {
            const alice = await createPlayer(harness, {
                twitchId: 'twitch-del-alice',
            });
            const deleted = alice.character?._id as Types.ObjectId;
            const aid = await persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'aid' },
                rescue: {
                    characters: [deleted],
                    failedQuest: new Types.ObjectId(),
                },
                concludedAt: null,
            });
            const someoneElse = new Types.ObjectId();
            const sharedAid = await persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'aid' },
                rescue: {
                    characters: [deleted, someoneElse],
                    failedQuest: new Types.ObjectId(),
                },
                concludedAt: null,
            });

            deletedUserOf(await deleteAs(alice.bearer));

            const raw = await quests.collection.findOne({ _id: aid._id });
            expect(raw?.concludedAt).toEqual(NOW);
            const listed = await call(QUESTS_QUERY, alice.bearer);
            expect(listed.errors).toBeUndefined();
            const listedIds = (listed.data?.quests as { id: string }[]).map(
                (quest) => quest.id,
            );
            expect(listedIds).not.toContain(String(aid._id));
            const shared = await quests.collection.findOne({
                _id: sharedAid._id,
            });
            expect(shared?.concludedAt).toBeNull();
            expect(shared?.rescue?.characters).toEqual([someoneElse]);
        });

        it('releases the seats once under concurrent deletions', async () => {
            const alice = await createPlayer(harness, {
                twitchId: 'twitch-del-alice',
            });
            const deleted = alice.character?._id as Types.ObjectId;
            const other = new Types.ObjectId();
            const quest = await persistRegisteredQuest('worldMission', [
                { character: deleted, title: 'rookie' },
                { character: other, title: 'hero' },
            ]);

            const bodies = await Promise.all([
                deleteAs(alice.bearer),
                deleteAs(alice.bearer),
            ]);

            const winners = bodies.filter((body) => body.errors === undefined);
            const losers = bodies.filter((body) => body.errors !== undefined);
            expect(winners).toHaveLength(1);
            expect(losers).toHaveLength(1);
            expect(errorCodeOf(losers[0])).toBe('CHARACTER_NOT_FOUND');
            expect(await archivedCount()).toBe(1);
            expect(await rawSeats(quest._id)).toEqual([
                { character: other, title: 'hero' },
            ]);
        });
    });
});
