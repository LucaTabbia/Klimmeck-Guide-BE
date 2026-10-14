import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthException } from 'src/auth/auth.exception';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthorizationErrorCode } from 'src/authz/authorization-error-code.enum';
import { AuthorizationException } from 'src/authz/authorization.exception';
import { ROLES_KEY, Roles } from 'src/authz/roles/roles.decorator';
import { RolesGuard } from 'src/authz/roles/roles.guard';
import { RoleType } from 'src/models/enums/role-type.enum';

class ProbeHandlers {
    @Roles(RoleType.innkeeper)
    adminOnly(): void {}

    open(): void {}
}

function handlerOf(name: keyof ProbeHandlers): () => void {
    return ProbeHandlers.prototype[name];
}

function identityWith(role: RoleType): AuthIdentity {
    return {
        userId: '64b0000000000000000000aa',
        twitchId: 'twitch-1',
        role,
    };
}

function graphqlContext(
    identity: AuthIdentity | undefined,
    handler = handlerOf('adminOnly'),
): ExecutionContext {
    const args = [{}, {}, { req: { user: identity } }, {}];
    return {
        getType: () => 'graphql',
        getArgs: () => args,
        getArgByIndex: (index: number) => args[index],
        getHandler: () => handler,
        getClass: () => ProbeHandlers,
    } as unknown as ExecutionContext;
}

function httpContext(
    identity: AuthIdentity | undefined,
    handler = handlerOf('adminOnly'),
): ExecutionContext {
    const request = { user: identity };
    return {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
        getArgs: () => [request],
        getHandler: () => handler,
        getClass: () => ProbeHandlers,
    } as unknown as ExecutionContext;
}

function rejectionOf(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error('expected the guard to throw');
}

describe('RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());

    it('lets a handler without roles through even without an identity', () => {
        expect(
            guard.canActivate(graphqlContext(undefined, handlerOf('open'))),
        ).toBe(true);
    });

    it('lets the innkeeper run an innkeeper-only graphql operation', () => {
        expect(
            guard.canActivate(graphqlContext(identityWith(RoleType.innkeeper))),
        ).toBe(true);
    });

    it('lets the innkeeper run an innkeeper-only http route', () => {
        expect(
            guard.canActivate(httpContext(identityWith(RoleType.innkeeper))),
        ).toBe(true);
    });

    it('forbids an adventurer from an innkeeper-only operation', () => {
        const error = rejectionOf(() =>
            guard.canActivate(
                graphqlContext(identityWith(RoleType.adventurer)),
            ),
        );

        expect(error).toBeInstanceOf(AuthorizationException);
        expect(error).toMatchObject({
            code: AuthorizationErrorCode.FORBIDDEN,
            message: 'Operazione riservata al locandiere',
        });
    });

    it('forbids a guard from an innkeeper-only operation', () => {
        const error = rejectionOf(() =>
            guard.canActivate(httpContext(identityWith(RoleType.guard))),
        );

        expect(error).toBeInstanceOf(AuthorizationException);
        expect(error).toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
    });

    it('fails closed as unauthenticated when no identity reached the handler', () => {
        const error = rejectionOf(() =>
            guard.canActivate(graphqlContext(undefined)),
        );

        expect(error).toBeInstanceOf(AuthException);
        expect(error).toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
    });

    it('composes the roles metadata with the method guard', () => {
        const handler = handlerOf('adminOnly');

        expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
            RoleType.innkeeper,
        ]);
        expect(Reflect.getMetadata('__guards__', handler)).toContain(
            RolesGuard,
        );
    });
});
