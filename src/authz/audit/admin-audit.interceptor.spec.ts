import {
    BadRequestException,
    type CallHandler,
    type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GraphQLBoolean, type GraphQLResolveInfo } from 'graphql';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { AuthIdentity } from 'src/auth/auth-identity';
import {
    AdminAuditInterceptor,
    outcomeCodeOf,
} from 'src/authz/audit/admin-audit.interceptor';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { OwnedResource } from 'src/authz/ownership/owned-resource';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';

class ProbeHandlers {
    @Roles(RoleType.innkeeper)
    adminMutation(): void {}

    playerMutation(): void {}
}

type HandlerName = keyof ProbeHandlers;

const OSTE: AuthIdentity = {
    userId: '64b0000000000000000000aa',
    twitchId: 'twitch-oste',
    role: RoleType.innkeeper,
};

function buildInfo(parentType = 'Mutation'): GraphQLResolveInfo {
    return {
        parentType: { name: parentType },
        fieldName: 'equipItem',
        returnType: GraphQLBoolean,
    } as unknown as GraphQLResolveInfo;
}

function graphqlContext(
    info: GraphQLResolveInfo,
    handler: HandlerName,
    args: Record<string, unknown> = { id: 'x', amount: 2 },
    identity: AuthIdentity | null = OSTE,
): ExecutionContext {
    const resolverArgs = [
        {},
        args,
        { req: { user: identity ?? undefined } },
        info,
    ];
    return {
        getType: () => 'graphql',
        getArgs: () => resolverArgs,
        getArgByIndex: (index: number) => resolverArgs[index],
        getHandler: () => ProbeHandlers.prototype[handler],
        getClass: () => ProbeHandlers,
    } as unknown as ExecutionContext;
}

function httpContext(): ExecutionContext {
    const request = { user: OSTE };
    return {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
        getArgs: () => [request],
        getHandler: () => ProbeHandlers.prototype['adminMutation'],
        getClass: () => ProbeHandlers,
    } as unknown as ExecutionContext;
}

function succeeding(): CallHandler {
    return { handle: () => of('result') };
}

function failing(error: unknown): CallHandler {
    return { handle: () => throwError(() => error) };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('expected a rejection');
}

describe('AdminAuditInterceptor', () => {
    let decisions: AuthorizationDecisions;
    let auditLog: { record: jest.Mock };
    let interceptor: AdminAuditInterceptor;

    beforeEach(() => {
        decisions = new AuthorizationDecisions();
        auditLog = { record: jest.fn().mockResolvedValue(undefined) };
        interceptor = new AdminAuditInterceptor(
            new Reflector(),
            decisions,
            auditLog as never,
        );
    });

    it('passes http requests through without recording', async () => {
        const handle = succeeding();

        const result = await lastValueFrom(
            interceptor.intercept(httpContext(), handle),
        );

        expect(result).toBe('result');
        expect(auditLog.record).not.toHaveBeenCalled();
    });

    it.each(['Query', 'Subscription'])(
        'does not record a %s even when the handler is @Roles(innkeeper)',
        async (parentType) => {
            const context = graphqlContext(
                buildInfo(parentType),
                'adminMutation',
            );

            await lastValueFrom(interceptor.intercept(context, succeeding()));

            expect(auditLog.record).not.toHaveBeenCalled();
        },
    );

    it('does not record a mutation without @Roles and without an on-behalf decision', async () => {
        const context = graphqlContext(buildInfo(), 'playerMutation');

        await lastValueFrom(interceptor.intercept(context, succeeding()));

        expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('records an innkeeper mutation with the full entry and outcome ok', async () => {
        const context = graphqlContext(buildInfo(), 'adminMutation');

        const result = await lastValueFrom(
            interceptor.intercept(context, succeeding()),
        );

        expect(result).toBe('result');
        expect(auditLog.record).toHaveBeenCalledTimes(1);
        expect(auditLog.record).toHaveBeenCalledWith({
            actor: {
                userId: OSTE.userId,
                twitchId: OSTE.twitchId,
                role: 'innkeeper',
            },
            action: 'equipItem',
            target: { type: 'Boolean', id: 'x' },
            args: { id: 'x', amount: 2 },
            outcome: 'ok',
        });
    });

    it('records an on-behalf player mutation with the decided target', async () => {
        const info = buildInfo();
        decisions.recordOnBehalf(info, {
            type: OwnedResource.character,
            id: 'c1',
        });
        const context = graphqlContext(info, 'playerMutation', {
            request: { id: 'c1' },
        });

        await lastValueFrom(interceptor.intercept(context, succeeding()));

        expect(auditLog.record).toHaveBeenCalledTimes(1);
        const entry = auditLog.record.mock.calls[0][0] as {
            target: unknown;
        };
        expect(entry.target).toEqual({ type: 'Character', id: 'c1' });
    });

    it('records a null target id when the @Roles mutation has no id argument', async () => {
        const context = graphqlContext(buildInfo(), 'adminMutation', {
            amount: 3,
        });

        await lastValueFrom(interceptor.intercept(context, succeeding()));

        expect(auditLog.record).toHaveBeenCalledWith(
            expect.objectContaining({ target: { type: 'Boolean', id: null } }),
        );
    });

    it('rethrows the same error instance and records its code', async () => {
        const error = ResourceNotFoundException.activeSpell();
        const context = graphqlContext(buildInfo(), 'adminMutation');

        const thrown = await rejectionOf(
            lastValueFrom(interceptor.intercept(context, failing(error))),
        );

        expect(thrown).toBe(error);
        expect(auditLog.record).toHaveBeenCalledTimes(1);
        expect(auditLog.record).toHaveBeenCalledWith(
            expect.objectContaining({ outcome: 'NOT_FOUND' }),
        );
    });

    it.each([
        [new BadRequestException('x'), 'BAD_REQUEST'],
        [new Error('boom'), 'INTERNAL_SERVER_ERROR'],
    ])(
        'records the outcome code of %p as %s',
        async (error: unknown, code: string) => {
            const context = graphqlContext(buildInfo(), 'adminMutation');

            await rejectionOf(
                lastValueFrom(interceptor.intercept(context, failing(error))),
            );

            expect(auditLog.record).toHaveBeenCalledWith(
                expect.objectContaining({ outcome: code }),
            );
        },
    );

    it('copies null-prototype GraphQL args into a plain object', async () => {
        const args = Object.assign(Object.create(null) as object, {
            request: Object.assign(Object.create(null) as object, {
                id: 'c1',
            }),
        }) as Record<string, unknown>;
        const context = graphqlContext(buildInfo(), 'adminMutation', args);

        await lastValueFrom(interceptor.intercept(context, succeeding()));

        const entry = auditLog.record.mock.calls[0][0] as {
            args: Record<string, unknown>;
        };
        expect(entry.args).toEqual({ request: { id: 'c1' } });
        expect(Object.getPrototypeOf(entry.args)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(entry.args.request)).toBe(
            Object.prototype,
        );
    });

    it('does not record when no identity is present on the request', async () => {
        const context = graphqlContext(
            buildInfo(),
            'adminMutation',
            { id: 'x' },
            null,
        );

        await lastValueFrom(interceptor.intercept(context, succeeding()));

        expect(auditLog.record).not.toHaveBeenCalled();
    });
});

describe('outcomeCodeOf', () => {
    it('reads the code from the error extensions', () => {
        expect(outcomeCodeOf(ResourceNotFoundException.activeSpell())).toBe(
            'NOT_FOUND',
        );
    });

    it('maps an HttpException status to its name', () => {
        expect(outcomeCodeOf(new BadRequestException('x'))).toBe('BAD_REQUEST');
    });

    it.each([new Error('boom'), null, 'boom'])(
        'falls back to INTERNAL_SERVER_ERROR for %p',
        (error) => {
            expect(outcomeCodeOf(error)).toBe('INTERNAL_SERVER_ERROR');
        },
    );
});
