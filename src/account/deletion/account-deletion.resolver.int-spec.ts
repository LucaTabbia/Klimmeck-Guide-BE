import { Model, Types } from 'mongoose';
import WebSocket from 'ws';
import { AccountDeletionModule } from 'src/account/deletion/account-deletion.module';
import type { AuthSession } from 'src/auth/dto/auth-session.model';
import { Session, SessionDocument } from 'src/auth/session/session.model';
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
    let harness: AuthTestApp;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let sessions: Model<SessionDocument>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [AccountDeletionModule],
            clock: new FixedClock(NOW),
        });
        users = harness.connection.model<UserDocument>(User.name);
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
});
