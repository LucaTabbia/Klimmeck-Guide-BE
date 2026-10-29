import { ValidationModule } from 'src/validation/validation.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { ValidationProbeResolver } from '../../test/validation/validation-probe.resolver';

const VALID_ID = '64b000000000000000000001';
const OTHER_ID = '64b000000000000000000002';
const PROBE_VALIDATION =
    'mutation Probe($input: ValidationProbeInput!) { probeValidation(input: $input) }';
const PROBE_UNDECORATED =
    'mutation Probe($input: UndecoratedProbeInput!) { probeUndecorated(input: $input) }';
const PROBE_ID = 'query Probe($id: String!) { probeId(id: $id) }';
const BAD_USER_INPUT = { code: 'BAD_USER_INPUT' };

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WireResponse {
    data?: Record<string, string> | null;
    errors?: WireError[];
}

function itemOf(item: string, quantity: number) {
    return { item, quantity };
}

function firstErrorOf(body: WireResponse) {
    const [error] = body.errors ?? [];
    return { message: error?.message, extensions: error?.extensions };
}

describe('global validation pipe (wire)', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [ValidationModule],
            providers: [ValidationProbeResolver],
        });
    });

    afterAll(async () => {
        await harness.close();
    });

    const send = async (query: string, variables: Record<string, unknown>) =>
        (await graphqlRequest(harness.app, query, variables))
            .body as WireResponse;

    it('strips a declared field without validators before the handler (D-01)', async () => {
        const body = await send(PROBE_VALIDATION, {
            input: {
                id: VALID_ID,
                items: [itemOf(OTHER_ID, 1)],
                legacy: 'x',
            },
        });

        expect(body).toEqual({ data: { probeValidation: '["id","items"]' } });
    });

    it('validates nested inputs declared with @Type (D-01)', async () => {
        const body = await send(PROBE_VALIDATION, {
            input: { id: VALID_ID, items: [itemOf(OTHER_ID, -1)] },
        });

        expect(firstErrorOf(body)).toEqual({
            message: 'Input non valido: items.0.quantity',
            extensions: BAD_USER_INPUT,
        });
    });

    it('answers BAD_USER_INPUT with field names only for a malformed id (D-02, D-03)', async () => {
        const body = await send(PROBE_VALIDATION, {
            input: { id: 'fake-bad-id', items: [] },
        });

        expect(firstErrorOf(body)).toEqual({
            message: 'Input non valido: id',
            extensions: BAD_USER_INPUT,
        });
    });

    it('reports the array cap on the parent field (D-03)', async () => {
        const body = await send(PROBE_VALIDATION, {
            input: {
                id: VALID_ID,
                items: [
                    itemOf(OTHER_ID, 1),
                    itemOf(OTHER_ID, 2),
                    itemOf(OTHER_ID, 3),
                ],
            },
        });

        expect(firstErrorOf(body)).toEqual({
            message: 'Input non valido: items',
            extensions: BAD_USER_INPUT,
        });
    });

    it('rejects a malformed scalar id argument with BAD_USER_INPUT (D-02)', async () => {
        const body = await send(PROBE_ID, { id: 'zz' });

        expect(firstErrorOf(body)).toEqual({
            message: 'Input non valido: id',
            extensions: BAD_USER_INPUT,
        });
    });

    it('passes a well-formed scalar id argument through (D-02)', async () => {
        const body = await send(PROBE_ID, { id: VALID_ID });

        expect(body).toEqual({ data: { probeId: VALID_ID } });
    });

    it('strips every property of an input class without validators (whitelist)', async () => {
        const body = await send(PROBE_UNDECORATED, { input: { note: 'x' } });

        expect(body).toEqual({ data: { probeUndecorated: '[]' } });
    });
});
