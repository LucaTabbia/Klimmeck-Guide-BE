import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export const ADMIN_AUDIT_LOG_TTL_SECONDS = 60 * 60 * 24 * 90;
export const AUDIT_OUTCOME_OK = 'ok';

@Schema({ _id: false })
export class AuditActor {
    @Prop({ type: String, required: true })
    userId: string;

    @Prop({ type: String, required: true })
    twitchId: string;

    @Prop({ type: String, required: true })
    role: string;
}

export const AuditActorSchema = SchemaFactory.createForClass(AuditActor);

// sotto-schema dedicato: inline, la chiave `type` verrebbe letta da Mongoose come tipo del campo
@Schema({ _id: false })
export class AuditTarget {
    @Prop({ type: String, required: true })
    type: string;

    @Prop({ type: String, default: null })
    id: string | null;
}

export const AuditTargetSchema = SchemaFactory.createForClass(AuditTarget);

// nessun @ObjectType: si consulta a DB, nessuna query GraphQL in questa fase (D-18)
@Schema({ collection: 'admin_audit_logs', versionKey: false })
export class AdminAuditLog {
    @Prop({ type: Date, required: true })
    at: Date;

    @Prop({ type: AuditActorSchema, required: true })
    actor: AuditActor;

    @Prop({ type: String, required: true })
    action: string;

    @Prop({ type: AuditTargetSchema, required: true })
    target: AuditTarget;

    @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
    args: Record<string, unknown>;

    @Prop({ type: String, required: true })
    outcome: string;
}

export type AdminAuditLogDocument = HydratedDocument<AdminAuditLog>;

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);

// 90 giorni (decisione utente D-18: niente rumore e costi); il monitor TTL di Mongo passa ~ogni 60 s
AdminAuditLogSchema.index(
    { at: 1 },
    { expireAfterSeconds: ADMIN_AUDIT_LOG_TTL_SECONDS },
);
