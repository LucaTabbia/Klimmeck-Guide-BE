import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { ServerTimeModule } from 'src/time/server-time.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createAuthenticatedUser } from '../../test/auth/test-tokens';

const SERVER_TIME = '{ serverTime }';
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CLOCK_TOLERANCE_MS = 5000;

interface WireBody {
    data?: { serverTime: string } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('serverTime (wire)', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [ServerTimeModule] });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('answers the server time in ISO 8601 to an authenticated user', async () => {
        const { bearer } = await createAuthenticatedUser(harness, {
            twitchId: 'twitch-server-time',
        });

        const body = bodyOf(
            await graphqlRequest(harness.app, SERVER_TIME, undefined, bearer),
        );

        expect(body.errors).toBeUndefined();
        const serverTime = body.data?.serverTime as string;
        expect(serverTime).toMatch(ISO_8601_UTC);
        expect(Math.abs(Date.parse(serverTime) - Date.now())).toBeLessThan(
            CLOCK_TOLERANCE_MS,
        );
    });

    it('stays unauthenticated without a bearer', async () => {
        const body = bodyOf(await graphqlRequest(harness.app, SERVER_TIME));

        expect(body.errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
        expect(body.data).toBeNull();
    });
});
