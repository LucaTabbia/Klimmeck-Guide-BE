import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthException } from 'src/auth/auth.exception';
import { AuthSession } from 'src/auth/dto/auth-session.model';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { SessionService } from 'src/auth/session/session.service';
import { AccessTokenService } from 'src/auth/token/access-token.service';
import { User } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AuthSessionService {
    constructor(
        private readonly sessionService: SessionService,
        private readonly accessTokenService: AccessTokenService,
        private readonly loginTicketService: LoginTicketService,
        private readonly usersService: UsersService,
    ) {}

    async issueForUser(user: User): Promise<AuthSession> {
        const { sessionId, refreshToken } = await this.sessionService.create(
            user.id,
        );
        return this.buildSession(user, sessionId, refreshToken);
    }

    async exchangeLoginTicket(
        ticket: string,
        codeVerifier: string,
    ): Promise<AuthSession> {
        const userId = await this.loginTicketService.redeem(
            ticket,
            codeVerifier,
        );
        const user = await this.findUserOrNull(userId);
        if (!user) throw AuthException.loginTicketInvalid();
        return this.issueForUser(user);
    }

    // il ruolo è riletto dal DB a ogni refresh (D-10)
    async refresh(refreshToken: string): Promise<AuthSession> {
        const rotated = await this.sessionService.rotate(refreshToken);
        const user = await this.findUserOrNull(rotated.userId);
        if (!user) {
            await this.sessionService.revoke(rotated.sessionId);
            throw AuthException.sessionRevoked();
        }
        return this.buildSession(user, rotated.sessionId, rotated.refreshToken);
    }

    // l'access JWT già emesso resta valido fino a exp (≤ 15 min, D-27); le identità dev non hanno sessione
    async logout(identity: AuthIdentity): Promise<boolean> {
        if (identity.sessionId) {
            await this.sessionService.revoke(identity.sessionId);
        }
        return true;
    }

    private async buildSession(
        user: User,
        sessionId: string,
        refreshToken: string,
    ): Promise<AuthSession> {
        const { accessToken, expiresAt } = await this.accessTokenService.sign({
            userId: user.id,
            twitchId: user.twitchId,
            role: user.role,
            sessionId,
        });
        return {
            accessToken,
            accessTokenExpiresAt: expiresAt,
            refreshToken,
            user,
        };
    }

    private async findUserOrNull(userId: string): Promise<User | null> {
        try {
            return await this.usersService.findOne(userId);
        } catch (error) {
            if (error instanceof NotFoundException) return null;
            throw error;
        }
    }
}
