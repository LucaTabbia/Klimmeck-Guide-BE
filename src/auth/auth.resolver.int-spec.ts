import type { Model } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { s256Challenge } from 'src/auth/crypto/token-crypto';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { persistUser } from '../../test/fixtures';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const WRONG_VERIFIER = 'wrongwrongwrongwrongwrongwrongwrongwrong123';
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TWITCH_ID = 'twitch-resolver-1';
const LOGIN_TICKET_TTL_PLUS_ONE_SECONDS = 61;
const REFRESH_GRACE_PLUS_ONE_SECONDS = 31;
const UNKNOWN_OBJECT_ID = '000000000000000000000000';

const SESSION_FIELDS = `accessToken accessTokenExpiresAt refreshToken user { id twitchId role }`;

const EXCHANGE_MUTATION = `
    mutation Exchange($ticket: String!, $codeVerifier: String!) {
        exchangeLoginTicket(ticket: $ticket, codeVerifier: $codeVerifier) { ${SESSION_FIELDS} }
    }
`;

const REFRESH_MUTATION = `
    mutation Refresh($refreshToken: String!) {
        refreshSession(refreshToken: $refreshToken) { ${SESSION_FIELDS} }
    }
`;

interface WireSession {
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshToken: string;
    user: { id: string; twitchId: string; role: RoleType };
}

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WireBody {
    data?: Record<string, WireSession | null> | null;
    errors?: WireError[];
}

describe('AuthResolver (wire)', () => {
    let harness: AuthTestApp;
    let clock: FixedClock;
    let users: Model<UserDocument>;
    let user: UserDocument;

    beforeAll(async () => {
        clock = new FixedClock();
        harness = await createAuthTestApp({ clock });
        users = harness.connection.model<UserDocument>(User.name);
    });

    beforeEach(async () => {
        user = await persistUser(users, {
            twitchId: TWITCH_ID,
            role: RoleType.adventurer,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function issueTicket(): Promise<string> {
        return harness.app
            .get(LoginTicketService)
            .issue(String(user._id), s256Challenge(VERIFIER));
    }

    async function exchange(
        ticket: string,
        codeVerifier = VERIFIER,
    ): Promise<WireBody> {
        const response = await graphqlRequest(harness.app, EXCHANGE_MUTATION, {
            ticket,
            codeVerifier,
        });
        expect(response.status).toBe(200);
        return response.body as WireBody;
    }

    async function refresh(refreshToken: string): Promise<WireBody> {
        const response = await graphqlRequest(harness.app, REFRESH_MUTATION, {
            refreshToken,
        });
        expect(response.status).toBe(200);
        return response.body as WireBody;
    }

    async function signIn(): Promise<WireSession> {
        const body = await exchange(await issueTicket());
        return body.data?.exchangeLoginTicket as WireSession;
    }

    function expectAuthError(body: WireBody, code: AuthErrorCode): WireError {
        const [error] = body.errors ?? [];
        expect(error.extensions.code).toBe(code);
        expect(error.extensions).not.toHaveProperty('originalError');
        expect(error.extensions).not.toHaveProperty('stacktrace');
        return error;
    }

    describe('exchangeLoginTicket', () => {
        it('returns an AuthSession for a valid ticket and verifier', async () => {
            const body = await exchange(await issueTicket());

            expect(body.errors).toBeUndefined();
            const session = body.data?.exchangeLoginTicket as WireSession;
            expect(session.accessToken).toEqual(expect.any(String));
            expect(session.accessToken.length).toBeGreaterThan(0);
            expect(Number.isNaN(Date.parse(session.accessTokenExpiresAt))).toBe(
                false,
            );
            expect(session.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(session.user).toEqual({
                id: String(user._id),
                twitchId: TWITCH_ID,
                role: RoleType.adventurer,
            });
        });

        it('rejects a replayed ticket with LOGIN_TICKET_INVALID', async () => {
            const ticket = await issueTicket();
            await exchange(ticket);

            const body = await exchange(ticket);

            const error = expectAuthError(
                body,
                AuthErrorCode.LOGIN_TICKET_INVALID,
            );
            expect(error.message).toBe('Login ticket is invalid or expired');
        });

        it('rejects a wrong verifier with LOGIN_TICKET_INVALID', async () => {
            const body = await exchange(await issueTicket(), WRONG_VERIFIER);

            expectAuthError(body, AuthErrorCode.LOGIN_TICKET_INVALID);
        });

        it('rejects an expired ticket with LOGIN_TICKET_INVALID', async () => {
            const ticket = await issueTicket();
            clock.advanceSeconds(LOGIN_TICKET_TTL_PLUS_ONE_SECONDS);

            const body = await exchange(ticket);

            expectAuthError(body, AuthErrorCode.LOGIN_TICKET_INVALID);
        });
    });

    describe('refreshSession', () => {
        it('rotates the refresh token', async () => {
            const session = await signIn();

            const body = await refresh(session.refreshToken);

            expect(body.errors).toBeUndefined();
            const rotated = body.data?.refreshSession as WireSession;
            expect(rotated.accessToken.length).toBeGreaterThan(0);
            expect(rotated.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(rotated.refreshToken).not.toBe(session.refreshToken);
            expect(rotated.user.id).toBe(String(user._id));
        });

        it('revokes the session when a rotated token is reused after the grace window', async () => {
            const session = await signIn();
            await refresh(session.refreshToken);
            clock.advanceSeconds(REFRESH_GRACE_PLUS_ONE_SECONDS);

            const body = await refresh(session.refreshToken);

            expectAuthError(body, AuthErrorCode.SESSION_REVOKED);
        });

        it('rejects an unknown token with SESSION_EXPIRED', async () => {
            const body = await refresh('unknown-token');

            expectAuthError(body, AuthErrorCode.SESSION_EXPIRED);
        });
    });

    it('leaves non-auth errors without an auth code', async () => {
        const response = await graphqlRequest(
            harness.app,
            `{ user(id: "${UNKNOWN_OBJECT_ID}") { id } }`,
        );

        const [error] = (response.body as WireBody).errors ?? [];
        expect(error).toBeDefined();
        expect(Object.values(AuthErrorCode)).not.toContain(
            error.extensions.code,
        );
    });
});
