import { Injectable } from '@nestjs/common';
import type { Context } from 'graphql-ws';
import type { Extra } from 'graphql-ws/use/ws';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { SessionService } from 'src/auth/session/session.service';
import {
    WS_SESSION_REVOKED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_REASON,
} from 'src/auth/ws/ws-close-codes';
import {
    type RegisteredSocket,
    WsSessionRegistry,
} from 'src/auth/ws/ws-session-registry';

export type AuthenticatedWsExtra = Extra & {
    identity?: AuthIdentity;
    expiryTimer?: NodeJS.Timeout;
    closed?: boolean;
};

export type WsConnectionContext = Context<
    Record<string, unknown> | undefined,
    AuthenticatedWsExtra
>;

type ClosableSocket = Pick<Extra['socket'], 'close'>;

@Injectable()
export class WsConnectionAuthenticator {
    constructor(
        private readonly identityResolver: AuthIdentityResolver,
        private readonly sessions: SessionService,
        private readonly registry: WsSessionRegistry,
    ) {}

    // ordine D-03: bearer → socket già chiuso → registrazione → una sola lettura della sessione;
    // registrare prima di leggere chiude la corsa con un login concorrente: o la revoca trova il socket nel registro, o la lettura vede la revoca
    async onConnect(context: WsConnectionContext): Promise<boolean> {
        try {
            const identity = await this.identityResolver.resolveBearer(
                readAuthorization(context.connectionParams),
            );
            context.extra.identity = identity;
            // onConnect è asincrono: un socket già chiuso non va né registrato né armato
            if (context.extra.closed) return true;
            if (
                identity.sessionId &&
                (await this.closeIfRevoked(
                    identity.sessionId,
                    context.extra.socket,
                ))
            ) {
                return false;
            }
            // il socket può chiudersi anche durante la lettura della sessione: onClose ha già ripulito, nessun timer va armato
            if (context.extra.closed) return true;
            context.extra.expiryTimer = scheduleExpiryClose(
                context.extra.socket,
                identity.expiresAt,
            );
            return true;
        } catch {
            // false → graphql-ws chiude con 4403; un'eccezione chiuderebbe con 4500 esponendo il messaggio interno
            return false;
        }
    }

    onClose(context: WsConnectionContext): void {
        context.extra.closed = true;
        if (context.extra.expiryTimer) clearTimeout(context.extra.expiryTimer);
        const sessionId = context.extra.identity?.sessionId;
        if (sessionId)
            this.registry.unregister(sessionId, context.extra.socket);
    }

    // chiude con 4409 e il motivo; il false che segue rende un no-op il 4403 di graphql-ws (probe P2)
    private async closeIfRevoked(
        sessionId: string,
        socket: RegisteredSocket,
    ): Promise<boolean> {
        this.registry.register(sessionId, socket);
        const revoked = await this.sessions.revokeReasonOf(sessionId);
        if (!revoked) return false;
        socket.close(WS_SESSION_REVOKED_CLOSE_CODE, revoked.reason ?? '');
        return true;
    }
}

function readAuthorization(
    params: Record<string, unknown> | undefined,
): unknown {
    return params?.Authorization ?? params?.authorization;
}

function scheduleExpiryClose(
    socket: ClosableSocket,
    expiresAt: number | undefined,
): NodeJS.Timeout | undefined {
    if (expiresAt === undefined) return undefined;
    const timer = setTimeout(
        () =>
            socket.close(WS_TOKEN_EXPIRED_CLOSE_CODE, WS_TOKEN_EXPIRED_REASON),
        Math.max(0, expiresAt - Date.now()),
    );
    timer.unref();
    return timer;
}
