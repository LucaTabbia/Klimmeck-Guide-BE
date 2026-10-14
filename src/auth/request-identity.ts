import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';

interface IdentityCarrier {
    user?: AuthIdentity;
}

// unica lettura dell'identità impostata dall'AuthGuard globale: REST, GraphQL HTTP e WS (req = extra.request)
export function readRequestIdentity(
    context: ExecutionContext,
): AuthIdentity | undefined {
    if (context.getType() === 'http') {
        return context.switchToHttp().getRequest<IdentityCarrier>().user;
    }
    const graphqlContext = GqlExecutionContext.create(context).getContext<
        { req?: IdentityCarrier } | undefined
    >();
    return graphqlContext?.req?.user;
}
