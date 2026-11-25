import request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from './auth-test-app';
import { FAKE_TWITCH_USER_ID } from './fake-twitch-oauth.client';

// coppia verifier/challenge S256 dell'esempio RFC 7636 (appendice B)
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const TERMS_VERSION = '2026-11-24';
const LEGACY_TWITCH_ID = 'twitch-legacy-1';

const SESSION_FIELDS = 'accessToken refreshToken';
const EXCHANGE = `
    mutation Exchange($ticket: String!, $codeVerifier: String!) {
        exchangeLoginTicket(ticket: $ticket, codeVerifier: $codeVerifier) { ${SESSION_FIELDS} }
    }
`;
const REFRESH = `
    mutation Refresh($refreshToken: String!) {
        refreshSession(refreshToken: $refreshToken) { ${SESSION_FIELDS} }
    }
`;
const ME = '{ me { twitchId } }';
const LOGOUT = 'mutation { logout }';

interface WireSession {
    accessToken: string;
    refreshToken: string;
}

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function sessionOf(response: request.Response, field: string): WireSession {
    const body = bodyOf(response);
    expect(body.errors).toBeUndefined();
    return body.data?.[field] as WireSession;
}

describe('Full login flow (start → callback → ticket → exchange → me → refresh → logout)', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp();
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function redirectParam(
        path: string,
        query: Record<string, string>,
        param: string,
    ): Promise<string> {
        const response = await request(harness.app.getHttpServer())
            .get(path)
            .query(query);
        expect(response.status).toBe(302);
        const value = new URL(response.headers.location).searchParams.get(
            param,
        );
        expect(value).toBeTruthy();
        return value as string;
    }

    async function meTwitchId(accessToken: string): Promise<unknown> {
        const response = await graphqlRequest(
            harness.app,
            ME,
            undefined,
            `Bearer ${accessToken}`,
        );
        expect(bodyOf(response).errors).toBeUndefined();
        return (bodyOf(response).data?.me as { twitchId: string }).twitchId;
    }

    it('signs in through the fake Twitch client and ends with a revoked session', async () => {
        const state = await redirectParam(
            '/auth/twitch/start',
            { challenge: CHALLENGE, termsVersion: TERMS_VERSION },
            'state',
        );
        const ticket = await redirectParam(
            '/auth/twitch/callback',
            { code: 'c', state },
            'ticket',
        );

        const issued = sessionOf(
            await graphqlRequest(harness.app, EXCHANGE, {
                ticket,
                codeVerifier: VERIFIER,
            }),
            'exchangeLoginTicket',
        );
        expect(await meTwitchId(issued.accessToken)).toBe(FAKE_TWITCH_USER_ID);

        const refreshed = sessionOf(
            await graphqlRequest(harness.app, REFRESH, {
                refreshToken: issued.refreshToken,
            }),
            'refreshSession',
        );
        expect(await meTwitchId(refreshed.accessToken)).toBe(
            FAKE_TWITCH_USER_ID,
        );

        const logout = await graphqlRequest(
            harness.app,
            LOGOUT,
            undefined,
            `Bearer ${refreshed.accessToken}`,
        );
        expect(bodyOf(logout).data?.logout).toBe(true);

        const afterLogout = await graphqlRequest(harness.app, REFRESH, {
            refreshToken: refreshed.refreshToken,
        });
        expect(bodyOf(afterLogout).errors?.[0]?.extensions.code).toBe(
            AuthErrorCode.SESSION_REVOKED,
        );
    });

    it('refreshes a session of a user written without consent (D-11)', async () => {
        await harness.connection.collection('users').insertOne({
            twitchId: LEGACY_TWITCH_ID,
            twitchPoints: 0,
            role: RoleType.adventurer,
            currentCharacter: null,
        });
        const legacy = await harness.connection
            .model<UserDocument>(User.name)
            .findOne({ twitchId: LEGACY_TWITCH_ID })
            .exec();
        const issued = await harness.app
            .get(AuthSessionService)
            .issueForUser(legacy as UserDocument);

        const refreshed = sessionOf(
            await graphqlRequest(harness.app, REFRESH, {
                refreshToken: issued.refreshToken,
            }),
            'refreshSession',
        );

        expect(await meTwitchId(refreshed.accessToken)).toBe(LEGACY_TWITCH_ID);
    });
});
