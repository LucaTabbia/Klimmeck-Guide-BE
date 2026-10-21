import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GraphQLResolveInfo } from 'graphql';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthorizationException } from 'src/authz/authorization.exception';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { ResourceAccess } from 'src/authz/ownership/owned-resource';
import {
    OWNERSHIP_KEY,
    type OwnershipRule,
    OwnsCharacter,
} from 'src/authz/ownership/ownership.decorators';
import { OwnershipGuard } from 'src/authz/ownership/ownership.guard';
import { RoleType } from 'src/models/enums/role-type.enum';

const FOREIGN_ID = '64b000000000000000000002';

class ProbeResolver {
    @OwnsCharacter<{ request: { id: string } }>(({ request }) => request.id)
    mutate(): void {}

    @OwnsCharacter<{ request: { id: string } }>(({ request }) => request.id, {
        ownerOnly: true,
    })
    strict(): void {}

    plain(): void {}
}

function handlerOf(name: keyof ProbeResolver): () => void {
    return ProbeResolver.prototype[name];
}

function buildIdentity(): AuthIdentity {
    return {
        userId: '64b0000000000000000000aa',
        twitchId: 'twitch-1',
        role: RoleType.innkeeper,
    };
}

function graphqlContext(
    gqlContext: Record<string, unknown>,
    info: GraphQLResolveInfo,
    handler = handlerOf('mutate'),
): ExecutionContext {
    const args = [{}, { request: { id: FOREIGN_ID } }, gqlContext, info];
    return {
        getType: () => 'graphql',
        getArgs: () => args,
        getArgByIndex: (index: number) => args[index],
        getHandler: () => handler,
        getClass: () => ProbeResolver,
    } as unknown as ExecutionContext;
}

function httpContext(handler = handlerOf('mutate')): ExecutionContext {
    const request = { user: buildIdentity() };
    return {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
        getArgs: () => [request],
        getHandler: () => handler,
        getClass: () => ProbeResolver,
    } as unknown as ExecutionContext;
}

describe('OwnershipGuard', () => {
    let policy: { authorize: jest.Mock };
    let decisions: AuthorizationDecisions;
    let guard: OwnershipGuard;
    let identity: AuthIdentity;
    let info: GraphQLResolveInfo;

    beforeEach(() => {
        policy = { authorize: jest.fn() };
        decisions = new AuthorizationDecisions();
        guard = new OwnershipGuard(new Reflector(), policy as never, decisions);
        identity = buildIdentity();
        info = {} as GraphQLResolveInfo;
    });

    it('lets a handler without ownership metadata through untouched', async () => {
        await expect(
            guard.canActivate(
                graphqlContext(
                    { req: { user: identity } },
                    info,
                    handlerOf('plain'),
                ),
            ),
        ).resolves.toBe(true);
        expect(policy.authorize).not.toHaveBeenCalled();
    });

    it('authorizes the selected character for its owner without recording a decision', async () => {
        policy.authorize.mockResolvedValue(ResourceAccess.owner);

        await expect(
            guard.canActivate(
                graphqlContext({ req: { user: identity } }, info),
            ),
        ).resolves.toBe(true);
        expect(policy.authorize).toHaveBeenCalledWith(
            identity,
            'Character',
            FOREIGN_ID,
            { ownerOnly: false },
        );
        expect(decisions.onBehalfTargetOf(info)).toBeUndefined();
    });

    it('passes ownerOnly to the policy for a strict handler', async () => {
        policy.authorize.mockResolvedValue(ResourceAccess.owner);

        await expect(
            guard.canActivate(
                graphqlContext(
                    { req: { user: identity } },
                    info,
                    handlerOf('strict'),
                ),
            ),
        ).resolves.toBe(true);
        expect(policy.authorize).toHaveBeenCalledWith(
            identity,
            'Character',
            FOREIGN_ID,
            { ownerOnly: true },
        );
        expect(decisions.onBehalfTargetOf(info)).toBeUndefined();
    });

    it('writes ownerOnly into the ownership metadata', () => {
        const reflector = new Reflector();

        expect(
            reflector.get<OwnershipRule>(OWNERSHIP_KEY, handlerOf('strict'))
                .ownerOnly,
        ).toBe(true);
        expect(
            reflector.get<OwnershipRule>(OWNERSHIP_KEY, handlerOf('mutate'))
                .ownerOnly,
        ).toBe(false);
    });

    it('records the on-behalf target on the resolve info for the audit', async () => {
        policy.authorize.mockResolvedValue(ResourceAccess.onBehalf);

        await expect(
            guard.canActivate(
                graphqlContext({ req: { user: identity } }, info),
            ),
        ).resolves.toBe(true);
        expect(decisions.onBehalfTargetOf(info)).toEqual({
            type: 'Character',
            id: FOREIGN_ID,
        });
    });

    it('rejects an authorization outcome it does not recognise', async () => {
        policy.authorize.mockResolvedValue(undefined);

        await expect(
            guard.canActivate(
                graphqlContext({ req: { user: identity } }, info),
            ),
        ).rejects.toThrow('Esito di autorizzazione non riconosciuto');
        expect(decisions.onBehalfTargetOf(info)).toBeUndefined();
    });

    it('propagates the policy rejection', async () => {
        const rejection = AuthorizationException.notOwner();
        policy.authorize.mockRejectedValue(rejection);

        await expect(
            guard.canActivate(
                graphqlContext({ req: { user: identity } }, info),
            ),
        ).rejects.toBe(rejection);
    });

    it('rejects an operation without an identity before asking the policy', async () => {
        await expect(
            guard.canActivate(graphqlContext({ req: {} }, info)),
        ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
        expect(policy.authorize).not.toHaveBeenCalled();
    });

    it('fails closed on a non graphql context', async () => {
        await expect(guard.canActivate(httpContext())).rejects.toBeInstanceOf(
            Error,
        );
        expect(policy.authorize).not.toHaveBeenCalled();
    });
});
