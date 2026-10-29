import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { GraphQLRequestContext } from 'src/graphql/graphql-context';
import { TooManyRequestsException } from 'src/throttling/too-many-requests.exception';

interface ThrottledRequestResponse {
    req: Record<string, any>;
    res: Record<string, any>;
}

// su graphql-ws il contesto non ha res: gli header di rate limit non hanno dove andare
const NO_HEADERS_RESPONSE: Record<string, any> = {
    header: () => undefined,
    setHeader: () => undefined,
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    protected getRequestResponse(
        context: ExecutionContext,
    ): ThrottledRequestResponse {
        if (context.getType<GqlContextType>() !== 'graphql') {
            return super.getRequestResponse(context);
        }
        const graphqlContext =
            GqlExecutionContext.create(
                context,
            ).getContext<GraphQLRequestContext>();
        const req = graphqlContext.req as Record<string, any>;
        const res = graphqlContext.res as Record<string, any> | undefined;
        return { req, res: res ?? NO_HEADERS_RESPONSE };
    }

    protected async throwThrottlingException(): Promise<void> {
        throw new TooManyRequestsException();
    }
}
