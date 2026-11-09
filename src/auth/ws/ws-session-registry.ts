import { Injectable } from '@nestjs/common';
import type { Extra } from 'graphql-ws/use/ws';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { WS_SESSION_REVOKED_CLOSE_CODE } from 'src/auth/ws/ws-close-codes';

export type RegisteredSocket = Pick<Extra['socket'], 'close'>;

// socket vivi per sessione, nel solo processo corrente (single-node, D-03): un secondo processo BE non vede questi socket, la connection_init successiva è comunque verificata a DB
@Injectable()
export class WsSessionRegistry {
    private readonly sockets = new Map<string, Set<RegisteredSocket>>();

    register(sessionId: string, socket: RegisteredSocket): void {
        const live = this.sockets.get(sessionId) ?? new Set<RegisteredSocket>();
        live.add(socket);
        this.sockets.set(sessionId, live);
    }

    unregister(sessionId: string, socket: RegisteredSocket): void {
        const live = this.sockets.get(sessionId);
        if (!live) return;
        live.delete(socket);
        if (live.size === 0) this.sockets.delete(sessionId);
    }

    isRegistered(sessionId: string): boolean {
        return this.sockets.has(sessionId);
    }

    closeSessions(
        sessionIds: readonly string[],
        reason: SessionRevokeReason,
    ): void {
        for (const sessionId of sessionIds) {
            for (const socket of this.sockets.get(sessionId) ?? []) {
                socket.close(WS_SESSION_REVOKED_CLOSE_CODE, reason);
            }
            this.sockets.delete(sessionId);
        }
    }
}
