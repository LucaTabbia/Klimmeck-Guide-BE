import type { NextFunction, Request, Response } from 'express';
import { RequestIdMiddleware } from 'src/http/request-id.middleware';

function run(header: unknown): {
    req: Request & { requestId?: string };
    setHeader: jest.Mock;
    next: jest.Mock;
} {
    const req = {
        headers: { 'x-request-id': header },
    } as unknown as Request & {
        requestId?: string;
    };
    const setHeader = jest.fn();
    const next = jest.fn();

    new RequestIdMiddleware().use(
        req,
        { setHeader } as unknown as Response,
        next as unknown as NextFunction,
    );

    return { req, setHeader, next };
}

describe('RequestIdMiddleware', () => {
    it('assigns the sanitized request id to the request and the response (D-07)', () => {
        const { req, setHeader, next } = run('abc');

        expect(req.requestId).toBe('abc');
        expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('replaces an unsafe request id header with a uuid (D-07)', () => {
        const { req, setHeader, next } = run('a b');

        expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
