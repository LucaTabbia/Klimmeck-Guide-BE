import { parseAuthConfig, readAuthEnv } from 'src/config/auth-config';
import {
    parseEventSubConfig,
    readEventSubEnv,
} from 'src/config/eventsub-config';
import { parsePushConfig, readPushEnv } from 'src/config/push-config';

export function validateEnv(
    env: Record<string, unknown>,
): Record<string, unknown> {
    parseAuthConfig(readAuthEnv(env));
    parsePushConfig(readPushEnv(env));
    parseEventSubConfig(readEventSubEnv(env));
    return env;
}
