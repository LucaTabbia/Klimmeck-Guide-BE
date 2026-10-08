import type { AuthConfig } from 'src/config/auth-config';
import { RoleType } from 'src/models/enums/role-type.enum';

export const TEST_JWT_SECRET = 'test-jwt-secret-0123456789abcdef-0123456789';
export const TEST_DEV_ACCESS_TOKEN = 'dev-test-access-token-0123456789';
export const TEST_DEV_TWITCH_ID = 'dev-twitch-1';
export const TEST_TWITCH_CLIENT_ID = 'test-client-id';

export function buildTestAuthConfig(
    overrides: Partial<AuthConfig> = {},
): AuthConfig {
    return {
        jwtSecret: TEST_JWT_SECRET,
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 2_592_000,
        refreshTokenGraceSeconds: 30,
        loginTicketTtlSeconds: 60,
        oauthStateTtlSeconds: 600,
        appAuthRedirectUrl: 'klimmeck://auth',
        twitch: {
            clientId: TEST_TWITCH_CLIENT_ID,
            clientSecret: 'test-client-secret',
            redirectUri: 'http://localhost:3000/auth/twitch/callback',
        },
        devAuth: {
            accessToken: TEST_DEV_ACCESS_TOKEN,
            twitchId: TEST_DEV_TWITCH_ID,
            role: RoleType.adventurer,
        },
        ...overrides,
    };
}
