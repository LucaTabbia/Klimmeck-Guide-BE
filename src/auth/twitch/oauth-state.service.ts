import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import {
    OAUTH_STATE_AUDIENCE,
    TOKEN_ISSUER,
} from 'src/auth/token/token-audiences';
import { isTermsVersion } from 'src/auth/twitch/terms-version';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const STATE_NONCE_BYTES = 16;

interface SignedStateClaims {
    challenge?: unknown;
    termsVersion?: unknown;
}

// termsVersion null = state senza versione valida: consenso mancante (Phase 26 D-19)
export interface OAuthStateClaims {
    challenge: string;
    termsVersion: string | null;
}

// stesso JWT_SECRET dell'access token: sicuro solo perché entrambe le verify impongono la propria audience
@Injectable()
export class OAuthStateService {
    constructor(
        private readonly jwtService: JwtService,
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    ) {}

    sign(challenge: string, termsVersion: string): Promise<string> {
        return this.jwtService.signAsync(
            {
                challenge,
                termsVersion,
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

    async verify(state: unknown): Promise<OAuthStateClaims | null> {
        if (typeof state !== 'string' || state === '') return null;
        try {
            const claims = await this.jwtService.verifyAsync<SignedStateClaims>(
                state,
                {
                    secret: this.config.jwtSecret,
                    algorithms: ['HS256'],
                    audience: OAUTH_STATE_AUDIENCE,
                    issuer: TOKEN_ISSUER,
                },
            );
            if (typeof claims.challenge !== 'string') return null;
            return {
                challenge: claims.challenge,
                termsVersion: isTermsVersion(claims.termsVersion)
                    ? claims.termsVersion
                    : null,
            };
        } catch {
            return null;
        }
    }
}
