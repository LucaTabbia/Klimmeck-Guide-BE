import type { Response } from 'express';
import type { IncomingMessage } from 'node:http';
import type { AuthenticatedWsExtra } from 'src/auth/ws/ws-connection-authenticator';
import { REQUEST_ID_HEADER, requestIdFrom } from 'src/graphql/request-id';
import type { RequestWithId } from 'src/http/request-id.middleware';

export const GRAPHQL_PATH = '/api/graphql';

export interface GraphQLContextInput {
    req?: RequestWithId;
    res?: Response;
    extra?: AuthenticatedWsExtra;
}

export interface GraphQLRequestContext {
    // su WS è l'IncomingMessage dell'upgrade
    req: RequestWithId | IncomingMessage | undefined;
    res?: Response;
    extra?: AuthenticatedWsExtra;
    requestId: string;
}

// unica funzione context per HTTP e WS: su WS req è l'IncomingMessage dell'upgrade (per-socket),
// quindi il suo header non identifica l'operazione e il requestId nasce nuovo a ogni contesto
export function buildGraphQLContext(
    input: GraphQLContextInput,
): GraphQLRequestContext {
    if (input.extra) {
        return {
            req: input.extra.request,
            extra: input.extra,
            requestId: requestIdFrom(undefined),
        };
    }
    return {
        req: input.req,
        res: input.res,
        requestId:
            input.req?.requestId ??
            requestIdFrom(input.req?.headers?.[REQUEST_ID_HEADER]),
    };
}
