import type { Request, Response } from 'express';
import type { AuthenticatedWsExtra } from 'src/auth/ws/ws-connection-authenticator';

export const GRAPHQL_PATH = '/api/graphql';

export interface GraphQLContextInput {
    req?: Request;
    res?: Response;
    extra?: AuthenticatedWsExtra;
}

export interface GraphQLRequestContext {
    req: any;
    res?: Response;
    extra?: AuthenticatedWsExtra;
}

// unica funzione context per HTTP e WS: su WS req è l'IncomingMessage dell'upgrade (per-socket)
export function buildGraphQLContext(
    input: GraphQLContextInput,
): GraphQLRequestContext {
    if (input.extra) return { req: input.extra.request, extra: input.extra };
    return { req: input.req, res: input.res };
}
