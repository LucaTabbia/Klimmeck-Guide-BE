import request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer } from '../../test/authz/player-fixture';

const REFRESH_SESSION =
    'mutation($refreshToken: String!) { refreshSession(refreshToken: $refreshToken) { accessToken } }';
const EXCHANGE_LOGIN_TICKET =
    'mutation($ticket: String!, $codeVerifier: String!) { exchangeLoginTicket(ticket: $ticket, codeVerifier: $codeVerifier) { accessToken } }';
const EQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful } }';
const UNKNOWN_SPELL_ID = '64b0000000000000000000ff';
const TEST_CODE_VERIFIER = 'v'.repeat(43);
const THROTTLED_ERROR = {
    message: 'Troppe richieste',
    extensions: { code: 'TOO_MANY_REQUESTS' },
};

interface GraphQLErrorBody {
    errors?: { message: string; extensions?: { code?: string } }[];
}

function firstErrorOf(response: request.Response) {
    const error = (response.body as GraphQLErrorBody).errors?.[0];
    return { message: error?.message, extensions: error?.extensions };
}

function errorCodeOf(response: request.Response): string | undefined {
    return firstErrorOf(response).extensions?.code;
}

describe('Throttling (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;
    let characterId: string;

    beforeAll(async () => {
        harness = await createCharactersTestApp({ throttle: { limit: 2 } });
        const player = await createPlayer(harness, {
            twitchId: 'twitch-throttling',
        });
        bearer = player.bearer;
        characterId = String(player.character!._id);
    });

    afterAll(async () => {
        await harness.close();
    });

    const refreshSession = () =>
        graphqlRequest(harness.app, REFRESH_SESSION, {
            refreshToken: 'test-refresh-token',
        });

    const exchangeLoginTicket = () =>
        graphqlRequest(harness.app, EXCHANGE_LOGIN_TICKET, {
            ticket: 'test-login-ticket',
            codeVerifier: TEST_CODE_VERIFIER,
        });

    it('answers TOO_MANY_REQUESTS on the third refreshSession from the same address (D-08, C8)', async () => {
        const first = await refreshSession();
        const second = await refreshSession();
        const third = await refreshSession();

        expect([errorCodeOf(first), errorCodeOf(second)]).toEqual([
            AuthErrorCode.SESSION_EXPIRED,
            AuthErrorCode.SESSION_EXPIRED,
        ]);
        expect(firstErrorOf(third)).toEqual(THROTTLED_ERROR);
    });

    it('throttles exchangeLoginTicket on its own bucket (D-08)', async () => {
        await refreshSession();
        await refreshSession();

        const first = await exchangeLoginTicket();
        const second = await exchangeLoginTicket();
        const third = await exchangeLoginTicket();

        expect([errorCodeOf(first), errorCodeOf(second)]).toEqual([
            AuthErrorCode.LOGIN_TICKET_INVALID,
            AuthErrorCode.LOGIN_TICKET_INVALID,
        ]);
        expect(firstErrorOf(third)).toEqual(THROTTLED_ERROR);
    });

    it('answers 429 with Retry-After on the REST image list (D-08)', async () => {
        const getUrls = () =>
            request(harness.app.getHttpServer())
                .post('/cloudinary/getUrls')
                .set({ Authorization: bearer })
                .send({ folder: 'characters' });

        await getUrls().expect(201);
        await getUrls().expect(201);
        const third = await getUrls();

        expect(third.status).toBe(429);
        expect(third.body).toEqual({
            statusCode: 429,
            code: 'TOO_MANY_REQUESTS',
            message: 'Troppe richieste',
        });
        expect(third.headers['retry-after']).toMatch(/^\d+$/);
    });

    it('never throttles a game mutation (D-08)', async () => {
        const codes: (string | undefined)[] = [];
        for (let call = 0; call < 20; call += 1) {
            const response = await graphqlRequest(
                harness.app,
                EQUIP_SPELL,
                { request: { id: characterId, spellId: UNKNOWN_SPELL_ID } },
                bearer,
            );
            codes.push(errorCodeOf(response));
        }

        expect(codes.filter((code) => code === 'TOO_MANY_REQUESTS')).toEqual(
            [],
        );
        expect(codes).toHaveLength(20);
    });
});

describe('Throttling behind a trusted proxy (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            throttle: { limit: 2, trustProxy: '1' },
        });
        bearer = (
            await createPlayer(harness, { twitchId: 'twitch-trusted-proxy' })
        ).bearer;
    });

    afterAll(async () => {
        await harness.close();
    });

    it('keeps separate buckets per forwarded client behind a trusted proxy (C19)', async () => {
        const getUrlsFrom = (forwardedFor: string) =>
            request(harness.app.getHttpServer())
                .post('/cloudinary/getUrls')
                .set({ Authorization: bearer, 'X-Forwarded-For': forwardedFor })
                .send({ folder: 'characters' });

        await getUrlsFrom('203.0.113.1').expect(201);
        await getUrlsFrom('203.0.113.1').expect(201);
        await getUrlsFrom('203.0.113.1').expect(429);

        await getUrlsFrom('203.0.113.2').expect(201);
    });
});
