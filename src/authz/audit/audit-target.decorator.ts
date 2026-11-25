import { SetMetadata } from '@nestjs/common';

export const AUDIT_TARGET_KEY = 'audit:target';

export interface AuditTargetRule {
    type: string;
    idOf: (args: Record<string, unknown>) => unknown;
    // argomenti salvati al posto di quelli ricevuti (Phase 26 D-25)
    argsOf?: (args: Record<string, unknown>) => Record<string, unknown>;
    // bersaglio dal risultato, solo alla riuscita; nullo nei rifiuti (Phase 26 D-25)
    idOfResult?: (result: unknown) => unknown;
}

type AuditTargetHooks = Pick<AuditTargetRule, 'argsOf' | 'idOfResult'>;

// target dichiarato dall'handler: l'interceptor lo preferisce al ripiego sul tipo restituito e sull'argomento id (D-17c)
export const AuditTarget = (
    type: string,
    idOf: AuditTargetRule['idOf'],
    hooks: AuditTargetHooks = {},
) =>
    SetMetadata(AUDIT_TARGET_KEY, {
        type,
        idOf,
        ...hooks,
    } satisfies AuditTargetRule);
