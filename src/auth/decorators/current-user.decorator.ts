import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import type { AuthIdentity } from 'src/auth/auth-identity';

type AuthenticatedRequest = Request & { user?: AuthIdentity };

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AuthIdentity | undefined => {
        if (context.getType() === 'http') {
            return context.switchToHttp().getRequest<AuthenticatedRequest>()
                .user;
        }
        const graphqlContext = GqlExecutionContext.create(context).getContext<{
            req?: AuthenticatedRequest;
        }>();
        return graphqlContext.req?.user;
    },
);
