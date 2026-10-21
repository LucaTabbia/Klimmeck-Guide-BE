import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { AuthException } from 'src/auth/auth.exception';
import { readRequestIdentity } from 'src/auth/request-identity';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { CharacterAccessPolicy } from 'src/authz/ownership/character-access.policy';
import { ResourceAccess } from 'src/authz/ownership/owned-resource';
import {
    OWNERSHIP_KEY,
    type OwnershipRule,
} from 'src/authz/ownership/ownership.decorators';

@Injectable()
export class OwnershipGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly policy: CharacterAccessPolicy,
        private readonly decisions: AuthorizationDecisions,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const rule = this.reflector.get<OwnershipRule | undefined>(
            OWNERSHIP_KEY,
            context.getHandler(),
        );
        if (!rule) return true;
        // fail-closed: un decorator applicato fuori da GraphQL non deve mai lasciar passare in silenzio
        if (context.getType<GqlContextType>() !== 'graphql') {
            throw new Error(
                'OwnsCharacter è supportato solo sui resolver GraphQL',
            );
        }
        const identity = readRequestIdentity(context);
        if (!identity) throw AuthException.unauthenticated();
        const gql = GqlExecutionContext.create(context);
        const targetId = rule.selectId(gql.getArgs());
        const access = await this.policy.authorize(
            identity,
            rule.resource,
            targetId,
            { ownerOnly: rule.ownerOnly },
        );
        if (access === ResourceAccess.onBehalf) {
            this.decisions.recordOnBehalf(gql.getInfo<GraphQLResolveInfo>(), {
                type: rule.resource,
                id: targetId,
            });
        } else if (access !== ResourceAccess.owner) {
            // difesa in profondità: un esito non riconosciuto non lascia mai passare
            throw new Error(
                `Esito di autorizzazione non riconosciuto: ${String(access)}`,
            );
        }
        return true;
    }
}
