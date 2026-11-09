import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import WebSocket from 'ws';
import { AuthSessionService } from 'src/auth/auth-session.service';
import type { AuthSession } from 'src/auth/dto/auth-session.model';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { persistUser } from '../fixtures';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from './auth-test-app';
import { TEST_DEV_ACCESS_TOKEN } from './test-auth-config';
import {
    AcknowledgedSocket,
    connectAndAwaitClose,
    graphqlWsUrl,
    openAcknowledgedSocket,
} from './ws-test-client';

// valori del contratto FE asseriti letterali: un cambio silenzioso delle costanti deve rompere il test
const SESSION_REVOKED_CLOSE_CODE = 4409;
const TWITCH_ID = 'twitch-last-login';
const DEV_BEARER = `Bearer ${TEST_DEV_ACCESS_TOKEN}`;
const LOGOUT_SILENCE_MS = 300;
const ME = '{ me { id } }';
const LOGOUT = 'mutation { logout }';
const REFRESH =
    'mutation Refresh($refreshToken: String!) { refreshSession(refreshToken: $refreshToken) { accessToken } }';

interface WireBody {
    data?: Record<string, any> | null;
    errors?: { extensions?: Record<string, unknown> }[];
}

function bearerOf({ accessToken }: AuthSession): string {
    return `Bearer ${accessToken}`;
}

function sessionIdOf({ accessToken }: AuthSession): string {
    return new JwtService().decode<{ sid: string }>(accessToken).sid;
}

// timer sempre ripulito: nessun handle aperto a fine test
async function stateAfter(
    closed: Promise<unknown>,
    windowMs: number,
): Promise<'open' | 'closed'> {
    let timer: NodeJS.Timeout | undefined;
    const silence = new Promise<'open'>((resolve) => {
        timer = setTimeout(() => resolve('open'), windowMs);
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

describe('last login wins (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let users: Model<UserDocument>;
    let sessions: Model<SessionDocument>;
    let user: UserDocument;
    let openSockets: WebSocket[] = [];

    beforeAll(async () => {
        harness = await createAuthTestApp();
        url = graphqlWsUrl(harness.port);
        users = harness.connection.model<UserDocument>(User.name);
        sessions = harness.connection.model<SessionDocument>(Session.name);
    });

    beforeEach(async () => {
        user = await persistUser(users, {
            twitchId: TWITCH_ID,
            role: RoleType.adventurer,
        });
    });

    afterEach(async () => {
        openSockets.forEach((socket) => socket.terminate());
        openSockets = [];
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function login(): Promise<AuthSession> {
        return harness.app.get(AuthSessionService).issueForUser(user);
    }

    async function openTracked(
        session: AuthSession,
    ): Promise<AcknowledgedSocket> {
        const opened = await openAcknowledgedSocket(url, {
            Authorization: bearerOf(session),
        });
        openSockets.push(opened.socket);
        return opened;
    }

    async function postGraphql(
        query: string,
        bearer: string,
        variables?: Record<string, unknown>,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            query,
            variables,
            bearer,
        ).expect(200);
        return response.body as WireBody;
    }

    function refresh(session: AuthSession): Promise<WireBody> {
        return postGraphql(REFRESH, bearerOf(session), {
            refreshToken: session.refreshToken,
        });
    }

    it('closes the live socket of the first session with 4409 newLogin at the second login (D-02, D-03)', async () => {
        const first = await login();
        const { closed } = await openTracked(first);

        await login();

        await expect(closed).resolves.toEqual({
            code: SESSION_REVOKED_CLOSE_CODE,
            reason: 'newLogin',
            acknowledged: true,
        });
    });

    it('closes a connection_init with the JWT of the replaced session with 4409 newLogin (D-03)', async () => {
        const first = await login();
        await login();

        await expect(
            connectAndAwaitClose(url, { Authorization: bearerOf(first) }),
        ).resolves.toEqual({
            code: SESSION_REVOKED_CLOSE_CODE,
            reason: 'newLogin',
            acknowledged: false,
        });
    });

    it('refuses the refresh of the replaced session with SESSION_REVOKED and newLogin (D-05)', async () => {
        const first = await login();
        await login();

        const body = await refresh(first);

        expect(body.data).toBeNull();
        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'SESSION_REVOKED',
            reason: 'newLogin',
        });
    });

    it('still serves HTTP with the residual JWT of the replaced session (D-04)', async () => {
        const first = await login();
        await login();

        const body = await postGraphql(ME, bearerOf(first));

        expect(body.errors).toBeUndefined();
        expect(body.data?.me?.id).toBe(String(user._id));
    });

    it('keeps the new session intact (D-02)', async () => {
        await login();
        const second = await login();

        const { socket } = await openTracked(second);
        const body = await refresh(second);

        expect(socket.readyState).toBe(WebSocket.OPEN);
        expect(body.errors).toBeUndefined();
        expect(typeof body.data?.refreshSession?.accessToken).toBe('string');
        expect(body.data?.refreshSession?.accessToken).not.toBe('');
    });

    it('does not close the live socket of a session at logout (D-03, D-07)', async () => {
        const session = await login();
        const { closed } = await openTracked(session);

        await postGraphql(LOGOUT, bearerOf(session));

        await expect(stateAfter(closed, LOGOUT_SILENCE_MS)).resolves.toBe(
            'open',
        );
        await expect(
            connectAndAwaitClose(url, { Authorization: bearerOf(session) }),
        ).resolves.toEqual({
            code: SESSION_REVOKED_CLOSE_CODE,
            reason: 'userLogout',
            acknowledged: false,
        });
    });

    it('revokes no session through the dev bypass (D-02)', async () => {
        const session = await login();

        const body = await postGraphql(ME, DEV_BEARER);

        expect(body.errors).toBeUndefined();
        const stored = await sessions
            .findById(sessionIdOf(session))
            .lean()
            .exec();
        expect(stored?.revokedAt).toBeNull();
        expect(stored?.revokeReason).toBeNull();
    });
});
