import type { ExecutionContext } from '@nestjs/common';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { readRequestIdentity } from 'src/auth/request-identity';
import { RoleType } from 'src/models/enums/role-type.enum';

const IDENTITY: AuthIdentity = {
    userId: 'user-1',
    twitchId: 'twitch-1',
    role: RoleType.adventurer,
    sessionId: 'session-1',
    expiresAt: 0,
};

function httpContext(request: Record<string, unknown>): ExecutionContext {
    return {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
        getArgs: () => [request],
    } as unknown as ExecutionContext;
}

function graphqlContext(gqlContext: unknown): ExecutionContext {
    const args = [{}, {}, gqlContext, {}];
    return {
        getType: () => 'graphql',
        getArgs: () => args,
        getArgByIndex: (index: number) => args[index],
        getHandler: () => () => undefined,
        getClass: () => Object,
    } as unknown as ExecutionContext;
}

describe('readRequestIdentity', () => {
    it('reads the identity of an HTTP request', () => {
        expect(readRequestIdentity(httpContext({ user: IDENTITY }))).toBe(
            IDENTITY,
        );
    });

    it('reads the identity of a GraphQL request', () => {
        expect(
            readRequestIdentity(graphqlContext({ req: { user: IDENTITY } })),
        ).toBe(IDENTITY);
    });

    it('returns undefined when the GraphQL request carries no identity', () => {
        expect(
            readRequestIdentity(graphqlContext({ req: {} })),
        ).toBeUndefined();
    });

    it('returns undefined when the GraphQL context has no request', () => {
        expect(readRequestIdentity(graphqlContext({}))).toBeUndefined();
    });

    it('returns undefined when the GraphQL context is missing', () => {
        expect(readRequestIdentity(graphqlContext(undefined))).toBeUndefined();
    });
});
