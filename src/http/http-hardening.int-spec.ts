import { Controller, Get, HttpException } from '@nestjs/common';
import request from 'supertest';
import { Public } from 'src/auth/decorators/public.decorator';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { ValidationProbeResolver } from '../../test/validation/validation-probe.resolver';

const UUID_PATTERN = /^[0-9a-f-]{36}$/;
const OVERSIZED_JSON_BYTES = 200 * 1024;
const PROBE_VALIDATION =
    'mutation Probe($input: ValidationProbeInput!) { probeValidation(input: $input) }';

@Controller('probe')
class HttpProbeController {
    @Public()
    @Get('boom')
    boom(): never {
        throw new Error('raw');
    }

    @Public()
    @Get('teapot')
    teapot(): never {
        throw new HttpException({ statusCode: 418, code: 'TEAPOT' }, 418);
    }
}

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
}

function probe(harness: AuthTestApp, path: string): request.Test {
    return request(harness.app.getHttpServer()).get(`/probe/${path}`);
}

describe('REST hardening (wire)', () => {
    let testHarness: AuthTestApp;
    let productionHarness: AuthTestApp;

    beforeAll(async () => {
        testHarness = await createAuthTestApp({
            controllers: [HttpProbeController],
            providers: [ValidationProbeResolver],
        });
        productionHarness = await createAuthTestApp({
            runtime: { mode: 'production', production: true },
            controllers: [HttpProbeController],
            providers: [ValidationProbeResolver],
        });
    });

    afterAll(async () => {
        await testHarness.close();
        await productionHarness.close();
    });

    it('keeps the REST error shape of today outside production (D-07)', async () => {
        const response = await probe(testHarness, 'boom');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            statusCode: 500,
            message: 'Internal server error',
        });
        expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });

    it('answers an unexpected REST error with INTERNAL_SERVER_ERROR and the request id in production (D-07)', async () => {
        const response = await probe(productionHarness, 'boom');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Errore interno',
            requestId: response.headers['x-request-id'],
        });
        expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });

    it('reuses the incoming request id in the coded REST error (D-07)', async () => {
        const response = await probe(productionHarness, 'boom').set(
            'x-request-id',
            'rest-1',
        );

        expect(response.headers['x-request-id']).toBe('rest-1');
        expect(response.body).toEqual({
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Errore interno',
            requestId: 'rest-1',
        });
    });

    it('answers an oversized JSON body with 413 instead of a masked 500 in production (D-07)', async () => {
        const response = await graphqlRequest(
            productionHarness.app,
            PROBE_VALIDATION,
            { padding: 'x'.repeat(OVERSIZED_JSON_BYTES) },
        );

        expect(response.status).toBe(413);
        expect(response.body).toEqual({
            statusCode: 413,
            message: 'request entity too large',
        });
    });

    it('keeps the body of HTTP exceptions (D-07)', async () => {
        const response = await probe(productionHarness, 'teapot');

        expect(response.status).toBe(418);
        expect(response.body).toEqual({ statusCode: 418, code: 'TEAPOT' });
    });

    it('keeps GraphQL error shapes untouched by the REST filter (Pitfall 6)', async () => {
        const response = await graphqlRequest(
            productionHarness.app,
            PROBE_VALIDATION,
            { input: { id: 'fake-bad-id', items: [] } },
        );
        const body = response.body as WireBody;

        expect(response.status).toBe(200);
        expect(
            body.errors?.map(({ message, extensions }) => ({
                message,
                extensions,
            })),
        ).toEqual([
            {
                message: 'Input non valido: id',
                extensions: { code: 'BAD_USER_INPUT' },
            },
        ]);
    });
});
