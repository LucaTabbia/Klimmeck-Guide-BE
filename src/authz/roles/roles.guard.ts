import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthException } from 'src/auth/auth.exception';
import { readRequestIdentity } from 'src/auth/request-identity';
import { AuthorizationException } from 'src/authz/authorization.exception';
import { ROLES_KEY } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';

// il ruolo è lo snapshot del JWT (D-12): nessuna rilettura da DB
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<RoleType[] | undefined>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (!roles?.length) return true;
        const identity = readRequestIdentity(context);
        if (!identity) throw AuthException.unauthenticated();
        if (!roles.includes(identity.role))
            throw AuthorizationException.innkeeperOnly();
        return true;
    }
}
