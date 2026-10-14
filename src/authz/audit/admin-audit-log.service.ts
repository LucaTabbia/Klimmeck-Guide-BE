import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
    AdminAuditLog,
    type AdminAuditLogDocument,
} from 'src/authz/audit/admin-audit-log.model';
import { RoleType } from 'src/models/enums/role-type.enum';

export interface AdminAuditEntry {
    actor: { userId: string; twitchId: string; role: RoleType };
    action: string;
    target: { type: string; id: string | null };
    args: Record<string, unknown>;
    outcome: string;
}

// best-effort (D-19): l'esito dell'operazione non dipende mai dalla scrittura dell'audit
@Injectable()
export class AdminAuditLogService {
    private readonly logger = new Logger(AdminAuditLogService.name);

    constructor(
        @InjectModel(AdminAuditLog.name)
        private readonly auditLogModel: Model<AdminAuditLogDocument>,
    ) {}

    async record(entry: AdminAuditEntry): Promise<void> {
        try {
            await this.auditLogModel.create({ ...entry, at: new Date() });
        } catch (error) {
            // mai gli args nel log: solo azione e messaggio dell'eccezione
            this.logger.error(
                `Scrittura dell'audit admin fallita per ${entry.action}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
