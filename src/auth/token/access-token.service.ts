import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthException } from 'src/auth/auth.exception';
import {
    ACCESS_TOKEN_AUDIENCE,
    TOKEN_ISSUER,
} from 'src/auth/token/token-audiences';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';
import { RoleType } from 'src/models/enums/role-type.enum';

export interface AccessTokenSubject {
    userId: string;
    twitchId: string;
    role: RoleType;
    sessionId: string;
}

export interface SignedAccessToken {
    accessToken: string;
    expiresAt: Date;
}

interface AccessTokenClaims {
    sub: string;
    twitchId: string;
    role: RoleType;
    sid: string;
    exp: number;
    iat: number;
}

const ROLE_VALUES: readonly unknown[] = Object.values(RoleType);

@Injectable()
export class AccessTokenService {
    constructor(
        private readonly jwtService: JwtService,
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    ) {}

    async sign(subject: AccessTokenSubject): Promise<SignedAccessToken> {
        const accessToken = await this.jwtService.signAsync(
            {
                sub: subject.userId,
                twitchId: subject.twitchId,
                role: subject.role,
                sid: subject.sessionId,
            },
            {
                secret: this.config.jwtSecret,
                algorithm: 'HS256',
                audience: ACCESS_TOKEN_AUDIENCE,
                issuer: TOKEN_ISSUER,
                expiresIn: this.config.accessTokenTtlSeconds,
            },
        );
        const { exp } = this.jwtService.decode<{ exp: number }>(accessToken);
        return { accessToken, expiresAt: new Date(exp * 1000) };
    }

    async verify(token: string): Promise<AuthIdentity> {
        const claims = await this.verifySignature(token);
        if (!hasValidShape(claims)) throw AuthException.unauthenticated();
        return {
            userId: claims.sub,
            twitchId: claims.twitchId,
            role: claims.role,
            sessionId: claims.sid,
            expiresAt: claims.exp * 1000,
        };
    }

    private async verifySignature(token: string): Promise<unknown> {
        try {
            return await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
                secret: this.config.jwtSecret,
                algorithms: ['HS256'],
                audience: ACCESS_TOKEN_AUDIENCE,
                issuer: TOKEN_ISSUER,
            });
        } catch {
            throw AuthException.unauthenticated();
        }
    }
}

function hasValidShape(claims: unknown): claims is AccessTokenClaims {
    if (typeof claims !== 'object' || claims === null) return false;
    const { sub, twitchId, sid, role, exp } = claims as Record<string, unknown>;
    return (
        isNonEmptyString(sub) &&
        isNonEmptyString(twitchId) &&
        isNonEmptyString(sid) &&
        ROLE_VALUES.includes(role) &&
        typeof exp === 'number'
    );
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}
