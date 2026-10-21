import { parseAuthConfig, readAuthEnv } from 'src/config/auth-config';
import {
    parseEventSubConfig,
    readEventSubEnv,
} from 'src/config/eventsub-config';
import { parsePushConfig, readPushEnv } from 'src/config/push-config';
import { parseTravelConfig, readTravelEnv } from 'src/config/travel-config';

export function validateEnv(
    env: Record<string, unknown>,
): Record<string, unknown> {
    parseAuthConfig(readAuthEnv(env));
    parsePushConfig(readPushEnv(env));
    parseEventSubConfig(readEventSubEnv(env));
    parseTravelConfig(readTravelEnv(env));
    return env;
}
