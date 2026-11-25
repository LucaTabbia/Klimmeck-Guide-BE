import { Logger } from '@nestjs/common';
import { Model, Schema, Types } from 'mongoose';
import WebSocket from 'ws';
import { AccountDeletionModule } from 'src/account/deletion/account-deletion.module';
import { PortraitStore } from 'src/account/deletion/portrait/portrait-store';
import type { AuthSession } from 'src/auth/dto/auth-session.model';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { TwitchUserDirectory } from 'src/auth/twitch/twitch-user-directory';
import { AdminAuditLog } from 'src/authz/audit/admin-audit-log.model';
import { PUSH_CONFIG } from 'src/config/push-config';
import { QUEST_CONFIG } from 'src/config/quest-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { PendingQuest } from 'src/models/pending-quest.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { questCancelled, startedQuestCancelled } from 'src/push/push-events';
import { PushMessage } from 'src/push/push-message';
import { PushPlatform } from 'src/push/push-platform.enum';
import {
    PushTransport,
    TokenDeliveryOutcome,
} from 'src/push/transport/push-transport';
import { QuestsModule } from 'src/quests/quests.module';
import { FakePortraitStore } from '../../../test/account/fake-portrait-store';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FakeTwitchUserDirectory } from '../../../test/auth/fake-twitch-user-directory';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    AuthenticatedTestUser,
    createAuthenticatedUser,
} from '../../../test/auth/test-tokens';
import {
    AcknowledgedSocket,
    connectAndAwaitClose,
    graphqlWsUrl,
    openAcknowledgedSocket,
    OpenSubscription,
    openSubscription,
} from '../../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistLore,
    persistPoi,
    persistQuest,
} from '../../../test/fixtures';
import {
    characterTouch,
    primeChangeStream,
    questTouch,
} from '../../../test/harness/prime-change-stream';
import { FakePushTransport } from '../../../test/push/fake-push-transport';

// ora reale al secondo: le sessioni revocate scadono a NOW + 900 s e il monitor TTL di Mongo non deve toglierle a metà caso
const NOW = new Date(Math.floor(new Date().getTime() / 1000) * 1000);
const DELETE_MY_ACCOUNT = 'mutation { deleteMyAccount }';
const DELETE_MY_ACCOUNT_WITH_ID =
    'mutation { deleteMyAccount(id: "64b0000000000000000000aa") }';
const DELETE_BY_LOGIN =
    'mutation DeleteAccountByTwitchLogin($twitchLogin: String!) { deleteAccountByTwitchLogin(twitchLogin: $twitchLogin) { twitchId } }';
const ME = '{ me { id } }';
const REFRESH =
    'mutation Refresh($refreshToken: String!) { refreshSession(refreshToken: $refreshToken) { accessToken } }';
// valori del contratto FE asseriti letterali: un cambio silenzioso delle costanti deve rompere il test
const SESSION_REVOKED_CLOSE_CODE = 4409;
// l'assenza di chiusura è provata dal socket ancora aperto dopo questa finestra
const SILENCE_MS = 300;
const HOUR_MS = 60 * 60 * 1000;
const STARTED_AT = new Date(NOW.getTime() - 2 * HOUR_MS);

type AnyModel = Model<any>;

// gli effetti esterni partono dopo il commit (regola dura 5): il trasporto legge il DB fuori dalla transazione nell'istante della chiamata
class CommitObservingPushTransport extends FakePushTransport {
    observe: (() => Promise<unknown>) | null = null;
    readonly observed: unknown[] = [];
    failSends = false;

    async sendToTokens(
        tokens: string[],
        message: PushMessage,
    ): Promise<TokenDeliveryOutcome[]> {
        if (this.observe) this.observed.push(await this.observe());
        if (this.failSends) throw new Error('fake send failure');
        return super.sendToTokens(tokens, message);
    }

    async unsubscribeFromTopic(tokens: string[], topic: string) {
        if (this.observe) this.observed.push(await this.observe());
        return super.unsubscribeFromTopic(tokens, topic);
    }

    reset(): void {
        super.reset();
        this.observe = null;
        this.observed.length = 0;
        this.failSends = false;
    }
}

interface WireBody {
    data?: Record<string, any> | null;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
}

describe('deleteMyAccount (wire)', () => {
    const directory = new FakeTwitchUserDirectory();
    const push = new CommitObservingPushTransport();
    const portraits = new FakePortraitStore();
    let harness: AuthTestApp;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let sessions: Model<SessionDocument>;
    let audits: Model<AdminAuditLog>;

    beforeAll(async () => {
        // AuthzModule (dall'harness dei personaggi) porta l'interceptor del registro dell'oste; i publisher di personaggi e quest
        // mostrano gli effetti sul filo; nessuna chiamata di rete a Twitch, FCM o Cloudinary
        harness = await createCharactersTestApp({
            imports: [AccountDeletionModule, QuestsModule],
            clock: new FixedClock(NOW),
            overrides: [
                { token: TwitchUserDirectory, useValue: directory },
                { token: PushTransport, useValue: push },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: PortraitStore, useValue: portraits },
                { token: QUEST_CONFIG, useValue: { sweepIntervalMs: 0 } },
            ],
        });
        users = harness.connection.model<UserDocument>(User.name);
        audits = harness.connection.model<AdminAuditLog>(AdminAuditLog.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        sessions = harness.connection.model<SessionDocument>(Session.name);
        // geografia del rientro: registrata qui se i moduli non la portano
        const registered = (name: string, schema: Schema): AnyModel =>
            harness.connection.models[name] ??
            harness.connection.model(name, schema);
        registered(City.name, CitySchema);
        registered(Lore.name, LoreSchema);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all(
            Object.values(harness.connection.models).map((model) =>
                model.init(),
            ),
        );
        await primeChangeStream(
            harness,
            'characterUpdated',
            characterTouch(harness),
        );
        await primeChangeStream(harness, 'questUpdated', questTouch(harness));
    });

    afterEach(async () => {
        await harness.clearDatabase();
        directory.reset();
        push.reset();
        portraits.destroyed.length = 0;
    });

    afterAll(async () => {
        await harness.close();
    });

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

    function errorCodeOf(body: WireBody): unknown {
        return body.errors?.[0]?.extensions?.code;
    }

    function rawUser(id: unknown) {
        return users.collection.findOne({
            _id: new Types.ObjectId(String(id)),
        });
    }

    function rawCharacter(id: unknown) {
        return characters.collection.findOne({
            _id: new Types.ObjectId(String(id)),
        });
    }

    it("deletes the caller's account and answers true (D-04, D-20)", async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-own',
        });

        const body = await call(DELETE_MY_ACCOUNT, player.bearer);

        expect(body).toEqual({ data: { deleteMyAccount: true } });
        expect(await rawUser(player.user._id)).toBeNull();
        expect(await rawCharacter(player.character?._id)).toBeNull();
    });

    it('deletes an account without a character (D-17)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-empty',
            withCharacter: false,
        });

        const body = await call(DELETE_MY_ACCOUNT, player.bearer);

        expect(body).toEqual({ data: { deleteMyAccount: true } });
        expect(await rawUser(player.user._id)).toBeNull();
    });

    it('refuses the innkeeper with INNKEEPER_ACCOUNT_PROTECTED and deletes nothing (D-16)', async () => {
        // ruolo scritto all'inserimento: il watcher dei ruoli ascolta solo gli update
        const innkeeper = await createPlayer(harness, {
            twitchId: 'tw-del-innkeeper',
            role: RoleType.innkeeper,
        });
        const userBefore = await rawUser(innkeeper.user._id);
        const characterBefore = await rawCharacter(innkeeper.character?._id);
        const sessionsBefore = await sessions.collection
            .find({ userId: innkeeper.user._id })
            .toArray();

        const body = await call(DELETE_MY_ACCOUNT, innkeeper.bearer);

        expect(body.data).toBeNull();
        expect(errorCodeOf(body)).toBe('INNKEEPER_ACCOUNT_PROTECTED');
        expect(await rawUser(innkeeper.user._id)).toEqual(userBefore);
        expect(await rawCharacter(innkeeper.character?._id)).toEqual(
            characterBefore,
        );
        expect(sessionsBefore).toHaveLength(1);
        expect(
            await sessions.collection
                .find({ userId: innkeeper.user._id })
                .toArray(),
        ).toEqual(sessionsBefore);
    });

    it('answers UNAUTHENTICATED to a token whose user is already gone (D-20)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-gone',
        });
        await users.deleteOne({ _id: player.user._id });

        const body = await call(DELETE_MY_ACCOUNT, player.bearer);

        expect(body.data).toBeNull();
        expect(errorCodeOf(body)).toBe('UNAUTHENTICATED');
        expect(await rawCharacter(player.character?._id)).not.toBeNull();
    });

    it('takes no argument (D-20)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-argument',
        });

        const body = await call(DELETE_MY_ACCOUNT_WITH_ID, player.bearer);

        expect(errorCodeOf(body)).toBe('GRAPHQL_VALIDATION_FAILED');
        expect(await rawUser(player.user._id)).not.toBeNull();
    });

    describe('revocation after deleteMyAccount (D-18)', () => {
        let url: string;
        let openSockets: WebSocket[] = [];

        beforeAll(() => {
            url = graphqlWsUrl(harness.port);
        });

        afterEach(() => {
            openSockets.forEach((socket) => socket.terminate());
            openSockets = [];
        });

        function login(twitchId: string): Promise<AuthenticatedTestUser> {
            return createAuthenticatedUser(harness, { twitchId });
        }

        async function openTracked(
            bearer: string,
        ): Promise<AcknowledgedSocket> {
            const opened = await openAcknowledgedSocket(url, {
                Authorization: bearer,
            });
            openSockets.push(opened.socket);
            return opened;
        }

        // timer sempre ripulito: nessun handle aperto a fine test
        async function stateAfter(
            closed: Promise<unknown>,
        ): Promise<'open' | 'closed'> {
            let timer: NodeJS.Timeout | undefined;
            const silence = new Promise<'open'>((resolve) => {
                timer = setTimeout(() => resolve('open'), SILENCE_MS);
            });
            try {
                return await Promise.race([
                    closed.then(() => 'closed' as const),
                    silence,
                ]);
            } finally {
                clearTimeout(timer);
            }
        }

        async function deleteOwnAccount(bearer: string): Promise<void> {
            expect(await call(DELETE_MY_ACCOUNT, bearer)).toEqual({
                data: { deleteMyAccount: true },
            });
        }

        function refresh(
            bearer: string,
            session: AuthSession,
        ): Promise<WireBody> {
            return call(REFRESH, bearer, {
                refreshToken: session.refreshToken,
            });
        }

        it("closes the caller's live socket with 4409 accountDeleted (D-03, D-18)", async () => {
            const caller = await login('tw-rev-socket');
            const { closed } = await openTracked(caller.bearer);

            // la chiusura può arrivare prima della risposta HTTP: si attendono entrambe
            const [, event] = await Promise.all([
                deleteOwnAccount(caller.bearer),
                closed,
            ]);

            expect(event).toEqual({
                code: SESSION_REVOKED_CLOSE_CODE,
                reason: 'accountDeleted',
                acknowledged: true,
            });
        });

        it('refuses the refresh with SESSION_REVOKED and accountDeleted (D-18)', async () => {
            const caller = await login('tw-rev-refresh');
            await deleteOwnAccount(caller.bearer);

            const body = await refresh(caller.bearer, caller.session);

            expect(body.data).toBeNull();
            expect(body.errors?.[0]?.extensions).toEqual({
                code: 'SESSION_REVOKED',
                reason: 'accountDeleted',
            });
        });

        it('answers UNAUTHENTICATED to the still valid access token (D-18)', async () => {
            const caller = await login('tw-rev-access');
            expect(await call(ME, caller.bearer)).toEqual({
                data: { me: { id: String(caller.user._id as Types.ObjectId) } },
            });
            await deleteOwnAccount(caller.bearer);

            const body = await call(ME, caller.bearer);

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('UNAUTHENTICATED');
        });

        it('refuses a reconnection with 4409 accountDeleted (D-18)', async () => {
            const caller = await login('tw-rev-reconnect');
            await deleteOwnAccount(caller.bearer);

            await expect(
                connectAndAwaitClose(url, { Authorization: caller.bearer }),
            ).resolves.toEqual({
                code: SESSION_REVOKED_CLOSE_CODE,
                reason: 'accountDeleted',
                acknowledged: false,
            });
        });

        it('leaves the sessions of other users alone (D-18)', async () => {
            const caller = await login('tw-rev-caller');
            const other = await login('tw-rev-other');
            const otherSocket = await openTracked(other.bearer);
            const otherSessionsBefore = await sessions.collection
                .find({ userId: other.user._id })
                .toArray();

            await deleteOwnAccount(caller.bearer);

            expect(otherSessionsBefore).toHaveLength(1);
            expect(otherSessionsBefore[0].revokedAt).toBeNull();
            expect(
                await sessions.collection
                    .find({ userId: other.user._id })
                    .toArray(),
            ).toEqual(otherSessionsBefore);
            expect(await stateAfter(otherSocket.closed)).toBe('open');
            expect(await call(ME, other.bearer)).toEqual({
                data: { me: { id: String(other.user._id as Types.ObjectId) } },
            });
            expect(
                (await refresh(other.bearer, other.session)).errors,
            ).toBeUndefined();
            expect(await rawUser(other.user._id)).not.toBeNull();
        });
    });

    describe('deleteAccountByTwitchLogin', () => {
        const OSTE_TWITCH_ID = '30001';
        const TARGET_TWITCH_ID = '40001';
        let url: string;
        let openSockets: WebSocket[] = [];

        beforeAll(() => {
            url = graphqlWsUrl(harness.port);
        });

        afterEach(() => {
            openSockets.forEach((socket) => socket.terminate());
            openSockets = [];
        });

        // ruolo scritto all'inserimento: il watcher dei ruoli ascolta solo gli update
        function createInnkeeper() {
            return createPlayer(harness, {
                twitchId: OSTE_TWITCH_ID,
                role: RoleType.innkeeper,
            });
        }

        function deleteByLogin(
            bearer: string,
            twitchLogin: string,
        ): Promise<WireBody> {
            return call(DELETE_BY_LOGIN, bearer, { twitchLogin });
        }

        async function auditEntries() {
            return audits.collection
                .find({ action: 'deleteAccountByTwitchLogin' })
                .sort({ at: 1, _id: 1 })
                .toArray();
        }

        async function dumpDatabase(): Promise<string> {
            const db = harness.connection.db!;
            const collections = await db.listCollections().toArray();
            const dump: Record<string, unknown[]> = {};
            for (const { name } of collections) {
                dump[name] = await db.collection(name).find({}).toArray();
            }
            return JSON.stringify(dump).toLowerCase();
        }

        it('deletes the account of a Twitch username and answers its Twitch id (D-15, D-20)', async () => {
            const innkeeper = await createInnkeeper();
            const target = await createPlayer(harness, {
                twitchId: TARGET_TWITCH_ID,
            });
            directory.idsByLogin.set('player_one', TARGET_TWITCH_ID);

            const body = await deleteByLogin(innkeeper.bearer, ' @Player_One ');

            expect(body).toEqual({
                data: {
                    deleteAccountByTwitchLogin: { twitchId: TARGET_TWITCH_ID },
                },
            });
            expect(directory.lookedUpLogins).toEqual(['player_one']);
            expect(await rawUser(target.user._id)).toBeNull();
            expect(await rawCharacter(target.character?._id)).toBeNull();
            expect(await rawUser(innkeeper.user._id)).not.toBeNull();
        });

        it('answers TWITCH_USER_NOT_FOUND for an impossible username without calling Twitch (D-15)', async () => {
            const innkeeper = await createInnkeeper();

            const body = await deleteByLogin(innkeeper.bearer, 'not a name!');

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('TWITCH_USER_NOT_FOUND');
            expect(directory.lookedUpLogins).toEqual([]);
        });

        it('answers TWITCH_USER_NOT_FOUND for a username Twitch does not know (D-15)', async () => {
            const innkeeper = await createInnkeeper();
            const target = await createPlayer(harness, {
                twitchId: TARGET_TWITCH_ID,
            });

            const body = await deleteByLogin(innkeeper.bearer, 'nobody_here');

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('TWITCH_USER_NOT_FOUND');
            expect(directory.lookedUpLogins).toEqual(['nobody_here']);
            expect(await rawUser(target.user._id)).not.toBeNull();
        });

        it('answers TWITCH_UNAVAILABLE when Twitch cannot be reached (D-15)', async () => {
            const innkeeper = await createInnkeeper();
            const target = await createPlayer(harness, {
                twitchId: TARGET_TWITCH_ID,
            });
            directory.idsByLogin.set('player_one', TARGET_TWITCH_ID);
            directory.unreachable = true;

            const body = await deleteByLogin(innkeeper.bearer, 'player_one');

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('TWITCH_UNAVAILABLE');
            expect(await rawUser(target.user._id)).not.toBeNull();
            expect(await rawCharacter(target.character?._id)).not.toBeNull();
        });

        it('answers ACCOUNT_NOT_FOUND when no account has that Twitch id (D-15)', async () => {
            const innkeeper = await createInnkeeper();
            const bystander = await createPlayer(harness, {
                twitchId: TARGET_TWITCH_ID,
            });
            directory.idsByLogin.set('ghost_player', '49999');

            const body = await deleteByLogin(innkeeper.bearer, 'ghost_player');

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('ACCOUNT_NOT_FOUND');
            expect(await rawUser(bystander.user._id)).not.toBeNull();
        });

        it('refuses an innkeeper target with INNKEEPER_ACCOUNT_PROTECTED (D-16)', async () => {
            const innkeeper = await createInnkeeper();
            directory.idsByLogin.set('the_innkeeper', OSTE_TWITCH_ID);
            const userBefore = await rawUser(innkeeper.user._id);
            const characterBefore = await rawCharacter(
                innkeeper.character?._id,
            );
            const sessionsBefore = await sessions.collection
                .find({ userId: innkeeper.user._id })
                .toArray();

            const body = await deleteByLogin(innkeeper.bearer, 'the_innkeeper');

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('INNKEEPER_ACCOUNT_PROTECTED');
            expect(await rawUser(innkeeper.user._id)).toEqual(userBefore);
            expect(await rawCharacter(innkeeper.character?._id)).toEqual(
                characterBefore,
            );
            expect(sessionsBefore).toHaveLength(1);
            expect(
                await sessions.collection
                    .find({ userId: innkeeper.user._id })
                    .toArray(),
            ).toEqual(sessionsBefore);
        });

        it('refuses a non-innkeeper caller before resolving anything (D-15)', async () => {
            const adventurer = await createPlayer(harness, {
                twitchId: '40002',
            });
            const target = await createPlayer(harness, {
                twitchId: TARGET_TWITCH_ID,
            });
            directory.idsByLogin.set('player_one', TARGET_TWITCH_ID);

            const body = await deleteByLogin(adventurer.bearer, 'player_one');

            expect(body.data).toBeNull();
            expect(errorCodeOf(body)).toBe('FORBIDDEN');
            expect(directory.lookedUpLogins).toEqual([]);
            expect(await rawUser(target.user._id)).not.toBeNull();
            expect(await auditEntries()).toEqual([]);
        });

        it('records the deletion in the innkeeper log without the username (D-25)', async () => {
            const innkeeper = await createInnkeeper();
            await createPlayer(harness, { twitchId: TARGET_TWITCH_ID });
            directory.idsByLogin.set('player_one', TARGET_TWITCH_ID);
            directory.idsByLogin.set('ghost_player', '49999');
            directory.idsByLogin.set('the_innkeeper', OSTE_TWITCH_ID);
            const attempts: [string, string | null, string][] = [
                [' @Player_One ', TARGET_TWITCH_ID, 'ok'],
                ['not a name!', null, 'TWITCH_USER_NOT_FOUND'],
                ['Nobody_Here', null, 'TWITCH_USER_NOT_FOUND'],
                ['Ghost_Player', null, 'ACCOUNT_NOT_FOUND'],
                ['The_Innkeeper', null, 'INNKEEPER_ACCOUNT_PROTECTED'],
            ];
            for (const [login] of attempts) {
                await deleteByLogin(innkeeper.bearer, login);
            }
            directory.unreachable = true;
            await deleteByLogin(innkeeper.bearer, 'Player_Two');
            attempts.push(['Player_Two', null, 'TWITCH_UNAVAILABLE']);

            const entries = await auditEntries();

            expect(
                entries.map((entry) => ({
                    keys: Object.keys(entry).sort(),
                    actor: entry.actor,
                    action: entry.action,
                    target: entry.target,
                    outcome: entry.outcome,
                })),
            ).toEqual(
                // argomenti oscurati: l'oggetto vuoto non arriva a DB (minimize di Mongoose), nessuna chiave args
                attempts.map(([, targetId, outcome]) => ({
                    keys: ['_id', 'action', 'actor', 'at', 'outcome', 'target'],
                    actor: {
                        userId: String(innkeeper.user._id as Types.ObjectId),
                        twitchId: OSTE_TWITCH_ID,
                        role: 'innkeeper',
                    },
                    action: 'deleteAccountByTwitchLogin',
                    target: { type: 'User', id: targetId },
                    outcome,
                })),
            );
            for (const [index, [login]] of attempts.entries()) {
                const serialized = JSON.stringify(entries[index]).toLowerCase();
                const normalized = login.trim().replace(/^@/, '').toLowerCase();
                expect({
                    login,
                    found: serialized.includes(normalized),
                }).toEqual({ login, found: false });
            }
        });

        it('keeps the username out of every collection (D-25)', async () => {
            const logged: unknown[] = [];
            const spies = (
                ['log', 'warn', 'error', 'debug', 'verbose'] as const
            ).map((method) =>
                jest
                    .spyOn(Logger.prototype, method)
                    .mockImplementation((...args: unknown[]) => {
                        logged.push(args);
                    }),
            );
            try {
                const innkeeper = await createInnkeeper();
                await createPlayer(harness, { twitchId: TARGET_TWITCH_ID });
                directory.idsByLogin.set('player_one', TARGET_TWITCH_ID);

                await deleteByLogin(innkeeper.bearer, ' @Player_One ');
                await deleteByLogin(innkeeper.bearer, 'Unknown_Viewer');

                const dump = await dumpDatabase();
                const logs = JSON.stringify(logged).toLowerCase();
                expect({
                    rawInDb: dump.includes('@player_one'),
                    normalizedInDb: dump.includes('player_one'),
                    unknownInDb: dump.includes('unknown_viewer'),
                    inLogs: ['player_one', 'unknown_viewer'].some((name) =>
                        logs.includes(name),
                    ),
                }).toEqual({
                    rawInDb: false,
                    normalizedInDb: false,
                    unknownInDb: false,
                    inLogs: false,
                });
                expect(dump).toContain('deleteaccountbytwitchlogin');
            } finally {
                spies.forEach((spy) => spy.mockRestore());
            }
        });

        it('closes the live socket of the deleted player with 4409 accountDeleted (D-15, D-18)', async () => {
            const innkeeper = await createInnkeeper();
            const target = await createAuthenticatedUser(harness, {
                twitchId: TARGET_TWITCH_ID,
            });
            directory.idsByLogin.set('player_one', TARGET_TWITCH_ID);
            const { socket, closed } = await openAcknowledgedSocket(url, {
                Authorization: target.bearer,
            });
            openSockets.push(socket);

            // la chiusura può arrivare prima della risposta HTTP: si attendono entrambe
            const [body, event] = await Promise.all([
                deleteByLogin(innkeeper.bearer, 'player_one'),
                closed,
            ]);

            expect(body).toEqual({
                data: {
                    deleteAccountByTwitchLogin: { twitchId: TARGET_TWITCH_ID },
                },
            });
            expect(event).toEqual({
                code: SESSION_REVOKED_CLOSE_CODE,
                reason: 'accountDeleted',
                acknowledged: true,
            });
        });
    });
    describe('after the commit (D-25)', () => {
        const PORTRAIT_ID = 'characters_profile/leaving-hero';
        const PORTRAIT_URL = `https://res.cloudinary.com/demo-cloud/image/upload/v1731000000/${PORTRAIT_ID}.jpg`;
        const LEAVING_TOKENS = ['tok-leaving-1', 'tok-leaving-2'];
        const CHARACTER_UPDATED =
            'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { id status { location { id } } quests { pendingQuest { id } } } }';
        const QUEST_UPDATED =
            'subscription OnQuest($questId: String!) { questUpdated(questId: $questId) { id registeredAdventurers { character } } }';
        let url: string;
        const opened: OpenSubscription<Record<string, any>>[] = [];

        beforeAll(() => {
            url = graphqlWsUrl(harness.port);
        });

        afterEach(async () => {
            await Promise.all(
                opened.splice(0).map((subscription) => subscription.dispose()),
            );
        });

        const model = (name: string): AnyModel =>
            harness.connection.model(name);

        async function registerDevice(
            userId: unknown,
            token: string,
        ): Promise<void> {
            await harness.connection.collection('push_devices').insertOne({
                userId,
                deviceId: `dev-${token}`,
                token,
                platform: PushPlatform.android,
                lastSeenAt: NOW,
            });
        }

        // il giocatore che se ne va: ritratto caricato e due device iscritti al topic
        async function leavingPlayer(twitchId: string): Promise<TestPlayer> {
            const player = await createPlayer(harness, {
                twitchId,
                characterOverrides: {
                    infos: {
                        ...buildCharacter().infos,
                        imagePath: PORTRAIT_URL,
                    },
                },
            });
            for (const token of LEAVING_TOKENS) {
                await registerDevice(player.user._id, token);
            }
            return player;
        }

        interface StartedScene {
            questId: Types.ObjectId;
            cityMarker: Types.ObjectId;
            a: TestPlayer;
            b: TestPlayer;
        }

        // quest avviata sul marker di una città, coi compagni A e B arrivati e un device ciascuno
        async function startedQuestHeldBy(
            leaving: TestPlayer,
        ): Promise<StartedScene> {
            const pois = model(PointOfInterest.name);
            const cityPoi = await persistPoi(pois);
            const questPoi = await persistPoi(pois);
            const lore = await persistLore(model(Lore.name));
            await persistCity(model(City.name), {
                markerLocation: cityPoi._id,
                pointsOfInterest: [questPoi._id],
                relatedLore: lore._id,
            });
            const questId = new Types.ObjectId();
            const companion = async (suffix: string): Promise<TestPlayer> => {
                const pendingQuestId = new Types.ObjectId();
                const player = await createPlayer(harness, {
                    twitchId: `tw-after-${suffix}`,
                });
                await characters.collection.updateOne(
                    { _id: player.character?._id as Types.ObjectId },
                    {
                        $set: {
                            'status.location': questPoi._id,
                            'quests.pendingQuest': pendingQuestId,
                        },
                    },
                );
                await model(PendingQuest.name).collection.insertOne({
                    _id: pendingQuestId,
                    quest: questId,
                    startDate: STARTED_AT,
                    arrivedAt: STARTED_AT,
                    waitingTime: 0,
                    pointsSpent: 10,
                });
                await registerDevice(player.user._id, `tok-after-${suffix}`);
                return player;
            };
            const a = await companion('a');
            const b = await companion('b');
            await persistQuest(model(Quest.name), {
                _id: questId,
                infos: {
                    ...buildQuest().infos,
                    type: 'boss',
                    markerLocation: questPoi._id,
                },
                registeredAdventurers: [leaving, a, b].map((player) => ({
                    character: player.character?._id,
                    title: 'rookie',
                })),
                startedAt: STARTED_AT,
                concludedAt: null,
            });
            return {
                questId,
                cityMarker: cityPoi._id as Types.ObjectId,
                a,
                b,
            };
        }

        // aid non avviata in cui il personaggio che se ne va è l'unico ferito: l'archivio libera il soccorritore
        async function aidRescuingOnly(
            leaving: TestPlayer,
        ): Promise<Types.ObjectId> {
            const pendingQuestId = new Types.ObjectId();
            const rescuer = await createPlayer(harness, {
                twitchId: 'tw-after-rescuer',
                characterOverrides: {
                    quests: {
                        completedQuests: [],
                        pendingQuest: pendingQuestId,
                    },
                },
            });
            await registerDevice(rescuer.user._id, 'tok-after-rescuer');
            const aid = await persistQuest(model(Quest.name), {
                infos: { ...buildQuest().infos, type: 'aid' },
                rescue: {
                    characters: [leaving.character?._id],
                    failedQuest: new Types.ObjectId(),
                },
                registeredAdventurers: [
                    {
                        character: rescuer.character?._id,
                        title: 'rookie',
                        registeredAt: NOW,
                    },
                ],
            });
            await model(PendingQuest.name).collection.insertOne({
                _id: pendingQuestId,
                quest: aid._id,
                startDate: null,
                arrivedAt: null,
                waitingTime: 0,
                pointsSpent: 0,
            });
            return aid._id as Types.ObjectId;
        }

        function queuedPortraits() {
            return harness.connection
                .collection('portrait_deletions')
                .find({}, { projection: { _id: 0 } })
                .toArray();
        }

        const byToken = (
            left: { tokens: string[] },
            right: { tokens: string[] },
        ) => left.tokens[0].localeCompare(right.tokens[0]);

        function cancellationPushesOf(scene: StartedScene) {
            const message = startedQuestCancelled(scene.questId.toHexString());
            return [
                { tokens: ['tok-after-a'], message },
                { tokens: ['tok-after-b'], message },
            ];
        }

        function liveSocketUnsubscription() {
            return [{ tokens: LEAVING_TOKENS, topic: 'streamer-live' }];
        }

        function sortedUnsubscriptions() {
            return push.unsubscriptions.map(({ tokens, topic }) => ({
                tokens: [...tokens].sort(),
                topic,
            }));
        }

        async function expectDeletedOwnAccount(leaving: TestPlayer) {
            expect(await call(DELETE_MY_ACCOUNT, leaving.bearer)).toEqual({
                data: { deleteMyAccount: true },
            });
            expect(await rawUser(leaving.user._id)).toBeNull();
        }

        function subscribe(
            query: string,
            variables: Record<string, unknown>,
            bearer: string,
        ): OpenSubscription<Record<string, any>> {
            const subscription = openSubscription<Record<string, any>>(
                url,
                { Authorization: bearer },
                { query, variables },
            );
            opened.push(subscription);
            return subscription;
        }

        // gli update di una stessa scrittura arrivano in raffica: si legge fino al primo che soddisfa l'attesa
        async function nextMatching(
            subscription: OpenSubscription<Record<string, any>>,
            field: string,
            matches: (value: any) => boolean,
        ): Promise<any> {
            for (;;) {
                const result = await subscription.next();
                expect(result.done).toBe(false);
                expect(result.value.errors).toBeUndefined();
                const value = result.value.data?.[field];
                if (matches(value)) return value;
            }
        }

        it('notifies the companions sent back with the cancellation text (D-13, D-26)', async () => {
            const leaving = await leavingPlayer('tw-after-leaving');
            const scene = await startedQuestHeldBy(leaving);
            push.observe = () => rawUser(leaving.user._id);

            await expectDeletedOwnAccount(leaving);

            expect([...push.sent].sort(byToken)).toEqual(
                cancellationPushesOf(scene),
            );
            expect(push.sent[0].message.type).toBe('questCancelled');
            expect(push.sent[0].message.body).not.toBe(
                questCancelled(scene.questId.toHexString()).body,
            );
            // ogni push e la disiscrizione vedono l'utente già cancellato: il commit è avvenuto prima
            expect(push.observed).toEqual([null, null, null]);
        });

        it("notifies the rescuers released by the archive with today's text (D-14)", async () => {
            const leaving = await leavingPlayer('tw-after-leaving');
            const aidId = await aidRescuingOnly(leaving);

            await expectDeletedOwnAccount(leaving);

            expect(push.sent).toEqual([
                {
                    tokens: ['tok-after-rescuer'],
                    message: questCancelled(aidId.toHexString()),
                },
            ]);
        });

        it("unsubscribes the deleted account's tokens from the live topic after the commit (D-25)", async () => {
            const leaving = await leavingPlayer('tw-after-leaving');
            push.observe = () =>
                harness.connection
                    .collection('push_devices')
                    .countDocuments({ userId: leaving.user._id });

            await expectDeletedOwnAccount(leaving);

            expect(sortedUnsubscriptions()).toEqual(liveSocketUnsubscription());
            expect(push.observed).toEqual([0]);
        });

        it('destroys the uploaded portrait right after the commit (portrait default)', async () => {
            const leaving = await leavingPlayer('tw-after-leaving');

            await expectDeletedOwnAccount(leaving);

            expect(portraits.destroyed).toEqual([PORTRAIT_ID]);
            expect(await queuedPortraits()).toEqual([]);
        });

        it('keeps the deletion when Cloudinary fails and leaves the portrait to the sweeper (portrait default)', async () => {
            const leaving = await leavingPlayer('tw-after-leaving');
            portraits.failNext();

            await expectDeletedOwnAccount(leaving);

            expect(portraits.destroyed).toEqual([]);
            expect(await queuedPortraits()).toEqual([
                { publicId: PORTRAIT_ID, queuedAt: NOW, attempts: 1 },
            ]);
        });

        it('keeps the deletion when the topic or a push fails (D-25)', async () => {
            const warned: string[] = [];
            jest.spyOn(Logger.prototype, 'warn').mockImplementation(
                (message: unknown) => {
                    warned.push(String(message));
                },
            );
            const leaving = await leavingPlayer('tw-after-leaving');
            const scene = await startedQuestHeldBy(leaving);
            push.failTopicManagement(new Error('fake topic failure'));
            push.failSends = true;

            await expectDeletedOwnAccount(leaving);

            expect(await rawCharacter(leaving.character?._id)).toBeNull();
            expect(
                (
                    await model(Quest.name).collection.findOne({
                        _id: scene.questId,
                    })
                )?.startedAt,
            ).toBeNull();
            expect(portraits.destroyed).toEqual([PORTRAIT_ID]);
            expect(warned.length).toBeGreaterThan(0);
            expect(warned.filter((line) => line.includes('tok-'))).toEqual([]);
            jest.restoreAllMocks();
        });

        it('publishes the companions sent back and the quest back on the board (D-26)', async () => {
            const leaving = await leavingPlayer('tw-after-leaving');
            const scene = await startedQuestHeldBy(leaving);
            const companion = subscribe(
                CHARACTER_UPDATED,
                { id: String(scene.a.character?._id) },
                scene.a.bearer,
            );
            const quest = subscribe(
                QUEST_UPDATED,
                { questId: scene.questId.toHexString() },
                scene.a.bearer,
            );
            const snapshot = await nextMatching(
                companion,
                'characterUpdated',
                () => true,
            );
            expect(snapshot.quests.pendingQuest).not.toBeNull();
            const questSnapshot = await nextMatching(
                quest,
                'questUpdated',
                () => true,
            );
            expect(questSnapshot.registeredAdventurers).toHaveLength(3);

            await expectDeletedOwnAccount(leaving);

            const sentBack = await nextMatching(
                companion,
                'characterUpdated',
                (character) =>
                    character.status.location.id ===
                    scene.cityMarker.toHexString(),
            );
            expect(sentBack).toEqual({
                id: String(scene.a.character?._id),
                status: { location: { id: scene.cityMarker.toHexString() } },
                quests: { pendingQuest: null },
            });
            const backOnTheBoard = await nextMatching(
                quest,
                'questUpdated',
                (value) => value.registeredAdventurers.length === 0,
            );
            expect(backOnTheBoard).toEqual({
                id: scene.questId.toHexString(),
                registeredAdventurers: [],
            });
            // startedAt è interno, mai sul filo: si legge a DB
            expect(
                (
                    await model(Quest.name).collection.findOne({
                        _id: scene.questId,
                    })
                )?.startedAt,
            ).toBeNull();
        });

        it('runs the same after-commit steps for the innkeeper path (D-15)', async () => {
            const innkeeper = await createPlayer(harness, {
                twitchId: '30002',
                role: RoleType.innkeeper,
            });
            const leaving = await leavingPlayer('40009');
            const scene = await startedQuestHeldBy(leaving);
            directory.idsByLogin.set('leaving_hero', '40009');

            const body = await call(DELETE_BY_LOGIN, innkeeper.bearer, {
                twitchLogin: 'leaving_hero',
            });

            expect(body).toEqual({
                data: { deleteAccountByTwitchLogin: { twitchId: '40009' } },
            });
            expect([...push.sent].sort(byToken)).toEqual(
                cancellationPushesOf(scene),
            );
            expect(sortedUnsubscriptions()).toEqual(liveSocketUnsubscription());
            expect(portraits.destroyed).toEqual([PORTRAIT_ID]);
            expect(await queuedPortraits()).toEqual([]);
        });
    });
});
