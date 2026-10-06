import { parseAuthConfig, readAuthEnv } from 'src/config/auth-config';

export function validateEnv(
    env: Record<string, unknown>,
): Record<string, unknown> {
    parseAuthConfig(readAuthEnv(env));
    return env;
}
