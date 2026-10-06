import { JwtService } from '@nestjs/jwt';
import type { AuthSession } from 'src/auth/dto/auth-session.model';
import { AuthSessionService } from 'src/auth/auth-session.service';
import {
    ACCESS_TOKEN_AUDIENCE,
    TOKEN_ISSUER,
} from 'src/auth/token/token-audiences';
import type { AuthConfig } from 'src/config/auth-config';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { persistUser } from '../fixtures';
import type { AuthTestApp } from './auth-test-app';

const EXPIRED_SINCE_SECONDS = 60;

export interface TestAccessTokenClaims {
    sub: string;
    twitchId: string;
    role: RoleType;
    sid: string;
}

export interface TestAccessTokenOptions {
    expired?: boolean;
    expiresInSeconds?: number;
    audience?: string;
}

export interface AuthenticatedTestUser {
    user: UserDocument;
    session: AuthSession;
    bearer: string;
}

// firma fuori dal servizio di produzione per costruire token scaduti o con audience sbagliata
export function signTestAccessToken(
    config: AuthConfig,
    claims: Partial<TestAccessTokenClaims> = {},
    options: TestAccessTokenOptions = {},
): string {
    const payload = {
        sub: '64b0000000000000000000f1',
        twitchId: 'twitch-token-1',
        role: RoleType.adventurer,
        sid: '64b0000000000000000000f2',
        ...claims,
        ...(options.expired
            ? { exp: Math.floor(Date.now() / 1000) - EXPIRED_SINCE_SECONDS }
            : {}),
    };
    return new JwtService().sign(payload, {
        secret: config.jwtSecret,
        algorithm: 'HS256',
        audience: options.audience ?? ACCESS_TOKEN_AUDIENCE,
        issuer: TOKEN_ISSUER,
        ...(options.expired
            ? {}
            : {
                  expiresIn:
                      options.expiresInSeconds ?? config.accessTokenTtlSeconds,
              }),
    });
}

export async function createAuthenticatedUser(
    testApp: AuthTestApp,
    overrides: Record<string, unknown> = {},
): Promise<AuthenticatedTestUser> {
    const user = (await persistUser(testApp.connection.model(User.name), {
        twitchId: 'twitch-http-1',
        ...overrides,
    })) as UserDocument;
    const session = await testApp.app
        .get(AuthSessionService)
        .issueForUser(user);
    return { user, session, bearer: `Bearer ${session.accessToken}` };
}
