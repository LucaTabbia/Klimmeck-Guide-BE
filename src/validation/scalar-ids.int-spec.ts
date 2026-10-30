import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { QuestsModule } from 'src/quests/quests.module';
import { RoadsModule } from 'src/roads/roads.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';

const GET_PATH =
    'query Path($from: ID!, $to: ID!) { getPath(from: $from, to: $to) { distance } }';
const QUEST = 'query Quest($id: String!) { quest(id: $id) { id } }';
const WELL_FORMED_ID = '64b0000000000000000000ff';
const MALFORMED_ID = 'abc';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function firstErrorOf(response: request.Response) {
    const [error] = (response.body as WireBody).errors ?? [];
    return { message: error?.message, extensions: error?.extensions };
}

describe('scalar id arguments outside the catalog (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestsModule, RoadsModule],
        });
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-scalar-ids',
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('rejects malformed path endpoints with BAD_USER_INPUT (D-02)', async () => {
        const fromResponse = await graphqlRequest(
            harness.app,
            GET_PATH,
            { from: MALFORMED_ID, to: WELL_FORMED_ID },
            bearer,
        );
        const toResponse = await graphqlRequest(
            harness.app,
            GET_PATH,
            { from: WELL_FORMED_ID, to: MALFORMED_ID },
            bearer,
        );

        expect(firstErrorOf(fromResponse)).toEqual({
            message: 'Input non valido: from',
            extensions: { code: 'BAD_USER_INPUT' },
        });
        expect(firstErrorOf(toResponse)).toEqual({
            message: 'Input non valido: to',
            extensions: { code: 'BAD_USER_INPUT' },
        });
    });

    it('answers UNAUTHENTICATED before validating a malformed id', async () => {
        const response = await graphqlRequest(harness.app, QUEST, {
            id: MALFORMED_ID,
        });

        expect(firstErrorOf(response).extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });
});
