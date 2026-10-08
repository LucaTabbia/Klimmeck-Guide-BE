import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import {
    OAUTH_STATE_AUDIENCE,
    TOKEN_ISSUER,
} from 'src/auth/token/token-audiences';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const STATE_NONCE_BYTES = 16;

interface OAuthStateClaims {
    challenge?: unknown;
}

// stesso JWT_SECRET dell'access token: sicuro solo perché entrambe le verify impongono la propria audience
@Injectable()
export class OAuthStateService {
    constructor(
        private readonly jwtService: JwtService,
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    ) {}

    sign(challenge: string): Promise<string> {
        return this.jwtService.signAsync(
            {
                challenge,
                nonce: randomBytes(STATE_NONCE_BYTES).toString('base64url'),
            },
            {
                secret: this.config.jwtSecret,
                algorithm: 'HS256',
                audience: OAUTH_STATE_AUDIENCE,
                issuer: TOKEN_ISSUER,
                expiresIn: this.config.oauthStateTtlSeconds,
            },
        );
    }

    async verifyChallenge(state: unknown): Promise<string | null> {
        if (typeof state !== 'string' || state === '') return null;
        try {
            const claims = await this.jwtService.verifyAsync<OAuthStateClaims>(
                state,
                {
                    secret: this.config.jwtSecret,
                    algorithms: ['HS256'],
                    audience: OAUTH_STATE_AUDIENCE,
                    issuer: TOKEN_ISSUER,
                },
            );
            return typeof claims.challenge === 'string'
                ? claims.challenge
                : null;
        } catch {
            return null;
        }
    }
}
