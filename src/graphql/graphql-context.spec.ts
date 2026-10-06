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
});
