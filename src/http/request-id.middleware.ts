import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestIdFrom } from 'src/graphql/request-id';

export type RequestWithId = Request & { requestId?: string };

// una sola fonte del requestId per REST e GraphQL HTTP (D-07)
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    use(req: RequestWithId, res: Response, next: NextFunction): void {
        const id = requestIdFrom(req.headers[REQUEST_ID_HEADER]);
        req.requestId = id;
        res.setHeader(REQUEST_ID_HEADER, id);
        next();
    }
}
