import { SetMetadata } from '@nestjs/common';

export const AUDIT_TARGET_KEY = 'audit:target';

export interface AuditTargetRule {
    type: string;
    idOf: (args: Record<string, unknown>) => unknown;
}

// target dichiarato dall'handler: l'interceptor lo preferisce al ripiego sul tipo restituito e sull'argomento id (D-17c)
export const AuditTarget = (type: string, idOf: AuditTargetRule['idOf']) =>
    SetMetadata(AUDIT_TARGET_KEY, { type, idOf } satisfies AuditTargetRule);
