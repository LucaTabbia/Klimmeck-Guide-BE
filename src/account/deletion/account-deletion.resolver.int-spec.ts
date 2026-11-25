import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import WebSocket from 'ws';
import { AccountDeletionModule } from 'src/account/deletion/account-deletion.module';
import type { AuthSession } from 'src/auth/dto/auth-session.model';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { TwitchUserDirectory } from 'src/auth/twitch/twitch-user-directory';
import { AdminAuditLog } from 'src/authz/audit/admin-audit-log.model';
import { AuthzModule } from 'src/authz/authz.module';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
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
} from '../../../test/auth/ws-test-client';
import { createPlayer } from '../../../test/authz/player-fixture';

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

interface WireBody {
    data?: Record<string, any> | null;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
}

describe('deleteMyAccount (wire)', () => {
    const directory = new FakeTwitchUserDirectory();
    let harness: AuthTestApp;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let sessions: Model<SessionDocument>;
    let audits: Model<AdminAuditLog>;

    beforeAll(async () => {
        // AuthzModule porta l'interceptor del registro dell'oste; nessuna chiamata di rete a Twitch
        harness = await createAuthTestApp({
            imports: [AccountDeletionModule, AuthzModule],
            clock: new FixedClock(NOW),
            overrides: [{ token: TwitchUserDirectory, useValue: directory }],
        });
        users = harness.connection.model<UserDocument>(User.name);
        audits = harness.connection.model<AdminAuditLog>(AdminAuditLog.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        sessions = harness.connection.model<SessionDocument>(Session.name);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all(
            Object.values(harness.connection.models).map((model) =>
                model.init(),
            ),
        );
    });

    afterEach(async () => {
        await harness.clearDatabase();
        directory.reset();
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
                entries.map(({ actor, action, target, args, outcome }) => ({
                    actor,
                    action,
                    target,
                    args,
                    outcome,
                })),
            ).toEqual(
                attempts.map(([, targetId, outcome]) => ({
                    actor: {
                        userId: String(innkeeper.user._id as Types.ObjectId),
                        twitchId: OSTE_TWITCH_ID,
                        role: 'innkeeper',
                    },
                    action: 'deleteAccountByTwitchLogin',
                    target: { type: 'User', id: targetId },
                    args: {},
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
});
