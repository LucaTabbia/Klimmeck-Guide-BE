import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { AppThrottlerGuard } from 'src/throttling/app-throttler.guard';
import { TooManyRequestsException } from 'src/throttling/too-many-requests.exception';

interface RequestResponse {
    req: Record<string, any>;
    res: Record<string, any>;
}

// espone i metodi protetti della guard senza cambiarne il comportamento
class InspectableThrottlerGuard extends AppThrottlerGuard {
    requestResponseOf(context: ExecutionContext): RequestResponse {
        return this.getRequestResponse(context);
    }

    throwFor(): Promise<void> {
        return this.throwThrottlingException();
    }
}

function graphqlContext(context: Record<string, unknown>): ExecutionContext {
    const host = new ExecutionContextHost([{}, {}, context, {}]);
    host.setType('graphql');
    return host;
}

describe('AppThrottlerGuard', () => {
    const guard = new InspectableThrottlerGuard(
        { throttlers: [] },
        {} as ThrottlerStorage,
        new Reflector(),
    );

    it('reads the request of a GraphQL operation and tolerates a missing response (D-08)', () => {
        const req = { ip: '127.0.0.1' };

        const { req: read, res } = guard.requestResponseOf(
            graphqlContext({ req, res: undefined }),
        );

        expect(read).toBe(req);
        expect(typeof res.header).toBe('function');
        expect(() => res.header('Retry-After', 60)).not.toThrow();
    });

    it('reads the response of a GraphQL operation over HTTP (D-08)', () => {
        const req = { ip: '127.0.0.1' };
        const res = { header: jest.fn() };

        expect(guard.requestResponseOf(graphqlContext({ req, res }))).toEqual({
            req,
            res,
        });
    });

    it('throws the coded exception when the limit is exceeded (C8)', async () => {
        await expect(guard.throwFor()).rejects.toBeInstanceOf(
            TooManyRequestsException,
        );
    });
});
