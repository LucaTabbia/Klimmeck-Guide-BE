import {
    CallHandler,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { getNamedType, type GraphQLResolveInfo } from 'graphql';
import { catchError, concatMap, from, Observable, throwError } from 'rxjs';
import { readRequestIdentity } from 'src/auth/request-identity';
import { AUDIT_OUTCOME_OK } from 'src/authz/audit/admin-audit-log.model';
import {
    AdminAuditEntry,
    AdminAuditLogService,
} from 'src/authz/audit/admin-audit-log.service';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { ROLES_KEY } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';

type PendingAuditEntry = Omit<AdminAuditEntry, 'outcome'>;

const FALLBACK_OUTCOME = 'INTERNAL_SERVER_ERROR';

// globale: gira anche su query e subscription, quindi filtra da sé le sole mutation (D-16);
// i guard girano prima: un tentativo rifiutato non produce record
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
    constructor(
        private readonly reflector: Reflector,
        private readonly decisions: AuthorizationDecisions,
        private readonly auditLog: AdminAuditLogService,
    ) {}

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const entry = this.pendingEntryOf(context);
        if (!entry) return next.handle();
        // scrittura attesa nella pipeline: test deterministici e nessun record perso allo shutdown;
        // record non lancia mai, quindi l'esito restituito al client non cambia
        return next.handle().pipe(
            concatMap(async (result: unknown) => {
                await this.auditLog.record({
                    ...entry,
                    outcome: AUDIT_OUTCOME_OK,
                });
                return result;
            }),
            catchError((error: unknown) =>
                from(
                    this.auditLog.record({
                        ...entry,
                        outcome: outcomeCodeOf(error),
                    }),
                ).pipe(concatMap(() => throwError(() => error))),
            ),
        );
    }

    private pendingEntryOf(
        context: ExecutionContext,
    ): PendingAuditEntry | null {
        if (context.getType<GqlContextType>() !== 'graphql') return null;
        const gql = GqlExecutionContext.create(context);
        const info = gql.getInfo<GraphQLResolveInfo>();
        if (info.parentType.name !== 'Mutation') return null;
        const identity = readRequestIdentity(context);
        if (!identity) return null;
        const onBehalf = this.decisions.onBehalfTargetOf(info);
        if (!onBehalf && !this.isInnkeeperOperation(context)) return null;
        const args = toPlainArgs(gql.getArgs<Record<string, unknown>>());
        return {
            actor: {
                userId: identity.userId,
                twitchId: identity.twitchId,
                role: identity.role,
            },
            action: info.fieldName,
            target: onBehalf ?? {
                type: getNamedType(info.returnType).name,
                id: typeof args.id === 'string' ? args.id : null,
            },
            args,
        };
    }

    private isInnkeeperOperation(context: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<RoleType[] | undefined>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );
        return roles?.includes(RoleType.innkeeper) === true;
    }
}

export function outcomeCodeOf(error: unknown): string {
    const code = (error as { extensions?: { code?: unknown } } | null)
        ?.extensions?.code;
    if (typeof code === 'string') return code;
    if (error instanceof HttpException) {
        return (
            (HttpStatus[error.getStatus()] as string | undefined) ??
            FALLBACK_OUTCOME
        );
    }
    return FALLBACK_OUTCOME;
}

// gli input GraphQL possono avere prototipo nullo: copia JSON per un documento Mixed pulito
// (id, quantità, enum: nessun segreto negli args, D-17)
function toPlainArgs(args: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(args ?? {})) as Record<string, unknown>;
}
