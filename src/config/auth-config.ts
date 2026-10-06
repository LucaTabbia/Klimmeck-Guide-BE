import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleType } from 'src/models/enums/role-type.enum';

export const AUTH_CONFIG = 'AUTH_CONFIG';

export const ACCESS_TOKEN_TTL_SECONDS = 900;
export const REFRESH_TOKEN_TTL_SECONDS = 2_592_000;
export const REFRESH_TOKEN_GRACE_SECONDS = 30;
export const LOGIN_TICKET_TTL_SECONDS = 60;
export const OAUTH_STATE_TTL_SECONDS = 600;
export const DEFAULT_APP_AUTH_REDIRECT_URL = 'klimmeck://auth';
export const JWT_SECRET_MIN_LENGTH = 32;
export const DEV_AUTH_TOKEN_MIN_LENGTH = 16;

export interface TwitchOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface DevAuthConfig {
    accessToken: string;
    twitchId: string;
    role: RoleType;
}

export interface AuthConfig {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    refreshTokenGraceSeconds: number;
    loginTicketTtlSeconds: number;
    oauthStateTtlSeconds: number;
    appAuthRedirectUrl: string;
    twitch: TwitchOAuthConfig | null;
    devAuth: DevAuthConfig | null;
}

export const AUTH_ENV_KEYS = [
    'NODE_ENV',
    'JWT_SECRET',
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
    'TWITCH_REDIRECT_URI',
    'APP_AUTH_REDIRECT_URL',
    'DEV_AUTH_ENABLED',
    'DEV_AUTH_ACCESS_TOKEN',
    'DEV_AUTH_TWITCH_ID',
    'DEV_AUTH_ROLE',
] as const;

export type AuthEnv = Partial<Record<(typeof AUTH_ENV_KEYS)[number], string>>;

const ROLE_VALUES: readonly string[] = Object.values(RoleType);

export function parseAuthConfig(env: AuthEnv): AuthConfig {
    return {
        jwtSecret: parseJwtSecret(env),
        accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
        refreshTokenGraceSeconds: REFRESH_TOKEN_GRACE_SECONDS,
        loginTicketTtlSeconds: LOGIN_TICKET_TTL_SECONDS,
        oauthStateTtlSeconds: OAUTH_STATE_TTL_SECONDS,
        appAuthRedirectUrl: parseAppAuthRedirectUrl(env),
        twitch: parseTwitchConfig(env),
        devAuth: parseDevAuthConfig(env),
    };
}

export function readAuthEnv(source: Record<string, unknown>): AuthEnv {
    const env: AuthEnv = {};
    for (const key of AUTH_ENV_KEYS) {
        const value = source[key];
        if (!isEnvScalar(value)) continue;
        env[key] = String(value);
    }
    return env;
}

export const authConfigProvider: FactoryProvider<AuthConfig> = {
    provide: AUTH_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseAuthConfig(
            readAuthEnv(
                Object.fromEntries(
                    AUTH_ENV_KEYS.map((key) => [key, config.get<string>(key)]),
                ),
            ),
        ),
};

function isEnvScalar(value: unknown): value is string | number | boolean {
    return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

function parseJwtSecret(env: AuthEnv): string {
    const jwtSecret = env.JWT_SECRET ?? '';
    if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
        throw new Error(
            `JWT_SECRET is required and must be at least ${JWT_SECRET_MIN_LENGTH} characters`,
        );
    }
    return jwtSecret;
}

function parseDevAuthConfig(env: AuthEnv): DevAuthConfig | null {
    const devAuthEnabled = env.DEV_AUTH_ENABLED === 'true';
    if (!devAuthEnabled) return null;
    if (env.NODE_ENV === 'production') {
        throw new Error(
            'DEV_AUTH_ENABLED=true is not allowed when NODE_ENV=production',
        );
    }

    const accessToken = env.DEV_AUTH_ACCESS_TOKEN ?? '';
    if (accessToken.length < DEV_AUTH_TOKEN_MIN_LENGTH) {
        throw new Error(
            `DEV_AUTH_ACCESS_TOKEN must be at least ${DEV_AUTH_TOKEN_MIN_LENGTH} characters when DEV_AUTH_ENABLED=true`,
        );
    }
    const twitchId = env.DEV_AUTH_TWITCH_ID ?? '';
    if (!twitchId) {
        throw new Error(
            'DEV_AUTH_TWITCH_ID is required when DEV_AUTH_ENABLED=true',
        );
    }
    const role = env.DEV_AUTH_ROLE ?? '';
    if (!ROLE_VALUES.includes(role)) {
        throw new Error(
            `DEV_AUTH_ROLE must be one of ${ROLE_VALUES.join(', ')} when DEV_AUTH_ENABLED=true`,
        );
    }
    return { accessToken, twitchId, role: role as RoleType };
}

function parseTwitchConfig(env: AuthEnv): TwitchOAuthConfig | null {
    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;
    const redirectUri = env.TWITCH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return null;
    if (!isAllowedTwitchRedirectUri(redirectUri)) {
        throw new Error(
            'TWITCH_REDIRECT_URI must use https or http://localhost',
        );
    }
    return { clientId, clientSecret, redirectUri };
}

function isAllowedTwitchRedirectUri(redirectUri: string): boolean {
    return (
        redirectUri.startsWith('https://') ||
        redirectUri.startsWith('http://localhost')
    );
}

function parseAppAuthRedirectUrl(env: AuthEnv): string {
    const appAuthRedirectUrl =
        env.APP_AUTH_REDIRECT_URL || DEFAULT_APP_AUTH_REDIRECT_URL;
    if (/^https?:/i.test(appAuthRedirectUrl)) {
        throw new Error(
            'APP_AUTH_REDIRECT_URL must be an app deep link, http(s) is not allowed',
        );
    }
    if (!appAuthRedirectUrl.includes('://')) {
        throw new Error(
            'APP_AUTH_REDIRECT_URL must be an absolute deep link (scheme://...)',
        );
    }
    return appAuthRedirectUrl;
}
