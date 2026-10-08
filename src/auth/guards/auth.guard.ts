import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { AuthException } from 'src/auth/auth.exception';
import { IS_PUBLIC_KEY } from 'src/auth/decorators/public.decorator';
import type { GraphQLRequestContext } from 'src/graphql/graphql-context';

interface GuardedRequest {
    headers?: { authorization?: unknown };
    user?: AuthIdentity;
}

// deny-by-default su REST, GraphQL HTTP e subscription WS: passa solo ciò che è marcato @Public()
@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly identityResolver: AuthIdentityResolver,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (this.isPublic(context)) return true;
        const request = this.getRequest(context);
        if (!request) throw AuthException.unauthenticated();
        request.user = await this.resolveIdentity(context, request);
        return true;
    }

    private isPublic(context: ExecutionContext): boolean {
        return (
            this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) === true
        );
    }

    private getRequest(context: ExecutionContext): GuardedRequest | undefined {
        if (context.getType() === 'http') {
            return context.switchToHttp().getRequest<GuardedRequest>();
        }
        return this.getGraphQLContext(context).req as
            | GuardedRequest
            | undefined;
    }

    // su WS l'identità è già stata risolta in onConnect: gli header dell'upgrade non vanno riletti
    private async resolveIdentity(
        context: ExecutionContext,
        request: GuardedRequest,
    ): Promise<AuthIdentity> {
        if (context.getType<GqlContextType>() === 'graphql') {
            const { extra } = this.getGraphQLContext(context);
            if (extra) return assertActiveWsIdentity(extra.identity);
        }
        return this.identityResolver.resolveBearer(
            request.headers?.authorization,
        );
    }

    private getGraphQLContext(
        context: ExecutionContext,
    ): Partial<GraphQLRequestContext> {
        return (
            GqlExecutionContext.create(context).getContext<
                Partial<GraphQLRequestContext>
            >() ?? {}
        );
    }
}

// difesa in profondità contro la race con il timer di chiusura 4401
function assertActiveWsIdentity(identity?: AuthIdentity): AuthIdentity {
    if (!identity) throw AuthException.unauthenticated();
    if (identity.expiresAt !== undefined && identity.expiresAt <= Date.now()) {
        throw AuthException.unauthenticated();
    }
    return identity;
}
