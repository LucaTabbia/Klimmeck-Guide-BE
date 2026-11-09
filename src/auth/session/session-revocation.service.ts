import { Injectable } from '@nestjs/common';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { SessionService } from 'src/auth/session/session.service';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';

// fan-out della revoca (Phase 17 D-02, D-06): prima la revoca a DB, poi i socket, mai l'inverso (un client che si riconnette trova già la sessione revocata); logout e riuso non passano da qui e non chiudono i socket vivi (D-03)
@Injectable()
export class SessionRevocationService {
    constructor(
        private readonly sessions: SessionService,
        private readonly registry: WsSessionRegistry,
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

    async revokeAllForRoleChange(userId: string): Promise<void> {
        const revoked = await this.sessions.revokeAllOf(
            userId,
            SessionRevokeReason.roleChanged,
        );
        this.registry.closeSessions(revoked, SessionRevokeReason.roleChanged);
    }
}
