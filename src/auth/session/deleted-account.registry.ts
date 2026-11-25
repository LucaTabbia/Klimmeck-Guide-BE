import { Inject, Injectable } from '@nestjs/common';
import { Clock } from 'src/auth/clock';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const MILLISECONDS_PER_SECOND = 1000;

// account cancellati negli ultimi 15 minuti (Phase 26 D-18): id utente, mai Twitch ID; single-node come WsSessionRegistry, un riavvio lo svuota (ripiego dichiarato)
@Injectable()
export class DeletedAccountRegistry {
    private readonly expiryByUserId = new Map<string, number>();
    private readonly windowMs: number;

    constructor(
        @Inject(AUTH_CONFIG) config: AuthConfig,
        private readonly clock: Clock,
    ) {
        this.windowMs = config.accessTokenTtlSeconds * MILLISECONDS_PER_SECOND;
    }

    mark(userId: string): void {
        const now = this.nowMs();
        this.forgetExpired(now);
        this.expiryByUserId.set(userId, now + this.windowMs);
    }

    isDeleted(userId: string): boolean {
        const expiresAt = this.expiryByUserId.get(userId);
        return expiresAt !== undefined && expiresAt > this.nowMs();
    }

    private forgetExpired(now: number): void {
        for (const [userId, expiresAt] of this.expiryByUserId) {
            if (expiresAt <= now) this.expiryByUserId.delete(userId);
        }
    }

    private nowMs(): number {
        return this.clock.now().getTime();
    }
}
