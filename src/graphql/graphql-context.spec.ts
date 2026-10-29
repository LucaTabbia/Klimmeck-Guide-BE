import type { Request, Response } from 'express';
import type { AuthenticatedWsExtra } from 'src/auth/ws/ws-connection-authenticator';
import { buildGraphQLContext, GRAPHQL_PATH } from 'src/graphql/graphql-context';

describe('buildGraphQLContext', () => {
    it('exposes the graphql path constant', () => {
        expect(GRAPHQL_PATH).toBe('/api/graphql');
    });

    it('keeps the HTTP request and response references', () => {
        const req = { headers: {} } as Request;
        const res = {} as Response;

        const context = buildGraphQLContext({ req, res });

        expect(context.req).toBe(req);
        expect(context.res).toBe(res);
        expect(context.extra).toBeUndefined();
    });

    it('maps the WS upgrade request to req and keeps extra', () => {
        const upgradeRequest = { headers: {} };
        const extra = {
            request: upgradeRequest,
            socket: {},
        } as unknown as AuthenticatedWsExtra;

        const context = buildGraphQLContext({ extra });

        expect(context.req).toBe(upgradeRequest);
        expect(context.extra).toBe(extra);
        expect(context).not.toHaveProperty('res');
    });

    it('assigns a request id to every HTTP operation (D-07)', () => {
        const req = {
            headers: { 'x-request-id': 'abc' },
        } as unknown as Request;

        expect(buildGraphQLContext({ req }).requestId).toBe('abc');
    });

    it('generates a request id for an HTTP operation without the header (D-07)', () => {
        const req = { headers: {} } as Request;

        expect(buildGraphQLContext({ req }).requestId).toMatch(
            /^[0-9a-f-]{36}$/,
        );
    });

    it('reuses the request id assigned by the HTTP middleware (D-07)', () => {
        const req = {
            headers: {},
            requestId: 'mw-1',
        } as unknown as Request;

        expect(buildGraphQLContext({ req }).requestId).toBe('mw-1');
    });

    it('assigns a fresh request id to every WS operation (D-07)', () => {
        const extra = {
            request: { headers: { 'x-request-id': 'abc' } },
            socket: {},
        } as unknown as AuthenticatedWsExtra;

        const first = buildGraphQLContext({ extra }).requestId;
        const second = buildGraphQLContext({ extra }).requestId;

        expect(first).toMatch(/^[0-9a-f-]{36}$/);
        expect(second).not.toBe(first);
    });
});
