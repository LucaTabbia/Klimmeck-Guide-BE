import { parseAuthConfig, readAuthEnv } from 'src/config/auth-config';
import { parsePushConfig, readPushEnv } from 'src/config/push-config';

export function validateEnv(
    env: Record<string, unknown>,
): Record<string, unknown> {
    parseAuthConfig(readAuthEnv(env));
    parsePushConfig(readPushEnv(env));
    return env;
}
