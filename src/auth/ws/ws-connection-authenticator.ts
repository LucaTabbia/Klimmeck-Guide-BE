import { Injectable } from '@nestjs/common';
import type { Context } from 'graphql-ws';
import type { Extra } from 'graphql-ws/use/ws';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import {
    WS_TOKEN_EXPIRED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_REASON,
} from 'src/auth/ws/ws-close-codes';

export type AuthenticatedWsExtra = Extra & {
    identity?: AuthIdentity;
    expiryTimer?: NodeJS.Timeout;
};

export type WsConnectionContext = Context<
    Record<string, unknown> | undefined,
    AuthenticatedWsExtra
>;

type ClosableSocket = Pick<Extra['socket'], 'close'>;

@Injectable()
export class WsConnectionAuthenticator {
    constructor(private readonly identityResolver: AuthIdentityResolver) {}

    async onConnect(context: WsConnectionContext): Promise<boolean> {
        try {
            const identity = await this.identityResolver.resolveBearer(
                readAuthorization(context.connectionParams),
            );
            context.extra.identity = identity;
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
        if (context.extra.expiryTimer) clearTimeout(context.extra.expiryTimer);
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
