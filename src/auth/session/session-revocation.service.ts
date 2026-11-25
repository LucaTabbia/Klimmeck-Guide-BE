import { Injectable } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { DeletedAccountRegistry } from 'src/auth/session/deleted-account.registry';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { SessionService } from 'src/auth/session/session.service';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';

export interface RoleChangeRevocationLimit {
    createdBefore?: Date;
}

// fan-out della revoca (Phase 17 D-02, D-06): prima la revoca a DB, poi i socket, mai l'inverso (un client che si riconnette trova già la sessione revocata); logout e riuso non passano da qui e non chiudono i socket vivi (D-03)
@Injectable()
export class SessionRevocationService {
    constructor(
        private readonly sessions: SessionService,
        private readonly registry: WsSessionRegistry,
        private readonly deletedAccounts: DeletedAccountRegistry,
    ) {}

    async revokeOthersOnLogin(
        userId: string,
        keepSessionId: string,
    ): Promise<void> {
        const revoked = await this.sessions.revokeOthersOf(
            userId,
            keepSessionId,
            SessionRevokeReason.newLogin,
        );
        this.registry.closeSessions(revoked, SessionRevokeReason.newLogin);
    }

    async revokeAllForRoleChange(
        userId: string,
        { createdBefore }: RoleChangeRevocationLimit = {},
    ): Promise<void> {
        const revoked = await this.sessions.revokeAllOf(
            userId,
            SessionRevokeReason.roleChanged,
            createdBefore,
        );
        this.registry.closeSessions(revoked, SessionRevokeReason.roleChanged);
    }

    async revokeAllForAccessLoss(userId: string): Promise<void> {
        const revoked = await this.sessions.revokeAllOf(
            userId,
            SessionRevokeReason.accessLost,
        );
        this.registry.closeSessions(revoked, SessionRevokeReason.accessLost);
    }

    // cancellazione dell'account (Phase 26 D-18): la revoca a DB dentro la transazione del chiamante...
    revokeForAccountDeletionWithin(
        userId: string,
        session: ClientSession,
    ): Promise<string[]> {
        return this.sessions.revokeAllForAccountDeletionWithin(userId, session);
    }

    // ...i socket e il registro degli access token ancora vivi solo dopo il commit (D-03, D-18)
    closeDeletedAccountSessions(
        userId: string,
        sessionIds: readonly string[],
    ): void {
        this.registry.closeSessions(
            sessionIds,
            SessionRevokeReason.accountDeleted,
        );
        this.deletedAccounts.mark(userId);
    }
}
