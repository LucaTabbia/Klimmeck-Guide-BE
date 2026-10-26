import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import {
    AdminAuditLog,
    AdminAuditLogSchema,
} from 'src/authz/audit/admin-audit-log.model';
import { AdminAuditLogService } from 'src/authz/audit/admin-audit-log.service';
import { AdminAuditInterceptor } from 'src/authz/audit/admin-audit.interceptor';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { CharacterAccessPolicy } from 'src/authz/ownership/character-access.policy';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { User, UserSchema } from 'src/models/user.model';

// policy e decisioni esportate: i guard di metodo vengono istanziati nel modulo che ospita il resolver;
// l'interceptor di audit è globale e condivide con i guard la stessa istanza di AuthorizationDecisions
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
        ]),
    ],
    providers: [
        CharacterAccessPolicy,
        AuthorizationDecisions,
        AdminAuditLogService,
        { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
    ],
    exports: [CharacterAccessPolicy, AuthorizationDecisions],
})
export class AuthzModule {}
