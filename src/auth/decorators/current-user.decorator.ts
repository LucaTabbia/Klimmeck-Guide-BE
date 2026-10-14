import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { readRequestIdentity } from 'src/auth/request-identity';

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AuthIdentity | undefined =>
        readRequestIdentity(context),
);
