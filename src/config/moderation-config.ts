import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

export const MODERATION_CONFIG = 'MODERATION_CONFIG';

export const MODERATION_ENV_KEYS = [
    'NODE_ENV',
    'SIGHTENGINE_USER_ID',
    'SIGHTENGINE_API_SECRET',
] as const;

export type ModerationEnv = Partial<
    Record<(typeof MODERATION_ENV_KEYS)[number], string>
>;

export interface SightengineCredentials {
    userId: string;
    secret: string;
}

export interface ModerationConfig {
    sightengine: SightengineCredentials | null;
}

// messaggi fissi: nominano le variabili, mai i valori (D-14)
export function parseModerationConfig(env: ModerationEnv): ModerationConfig {
    const userId = (env.SIGHTENGINE_USER_ID ?? '').trim();
    const secret = (env.SIGHTENGINE_API_SECRET ?? '').trim();
    if (!userId && !secret) return disabledModerationConfig(env);
    if (!userId || !secret) {
        throw new Error(
            'SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET must be set together',
        );
    }
    return { sightengine: { userId, secret } };
}

export function readModerationEnv(
    source: Record<string, unknown>,
): ModerationEnv {
    return readEnvKeys(source, MODERATION_ENV_KEYS);
}

export const moderationConfigProvider: FactoryProvider<ModerationConfig> = {
    provide: MODERATION_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseModerationConfig(
            readModerationEnv(
                Object.fromEntries(
                    MODERATION_ENV_KEYS.map((key) => [
                        key,
                        config.get<string>(key),
                    ]),
                ),
            ),
        ),
};

function disabledModerationConfig(env: ModerationEnv): ModerationConfig {
    if (env.NODE_ENV === 'production') {
        throw new Error(
            'SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET are required when NODE_ENV=production',
        );
    }
    return { sightengine: null };
}
