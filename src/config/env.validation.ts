import { parseAuthConfig, readAuthEnv } from 'src/config/auth-config';
import {
    parseEventSubConfig,
    readEventSubEnv,
} from 'src/config/eventsub-config';
import {
    parseModerationConfig,
    readModerationEnv,
} from 'src/config/moderation-config';
import { parsePushConfig, readPushEnv } from 'src/config/push-config';
import { parseQuestConfig, readQuestEnv } from 'src/config/quest-config';
import { parseRuntimeConfig, readRuntimeEnv } from 'src/config/runtime-config';
import {
    parseSpellRecoveryConfig,
    readSpellRecoveryEnv,
} from 'src/config/spell-recovery-config';
import {
    parseThrottleConfig,
    readThrottleEnv,
} from 'src/config/throttle-config';
import { parseTravelConfig, readTravelEnv } from 'src/config/travel-config';

export function validateEnv(
    env: Record<string, unknown>,
): Record<string, unknown> {
    parseRuntimeConfig(readRuntimeEnv(env));
    parseAuthConfig(readAuthEnv(env));
    parsePushConfig(readPushEnv(env));
    parseEventSubConfig(readEventSubEnv(env));
    parseModerationConfig(readModerationEnv(env));
    parseTravelConfig(readTravelEnv(env));
    parseQuestConfig(readQuestEnv(env));
    parseSpellRecoveryConfig(readSpellRecoveryEnv(env));
    parseThrottleConfig(readThrottleEnv(env));
    return env;
}
