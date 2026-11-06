import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

// fuso delle imboscate (Phase 15 D-04): opzionale, vuota = Europe/Rome, validata con Intl al boot; non è un segreto

export const AMBUSH_CONFIG = 'AMBUSH_CONFIG';
export const DEFAULT_AMBUSH_TIMEZONE = 'Europe/Rome';

export const AMBUSH_ENV_KEYS = ['AMBUSH_TIMEZONE'] as const;

export type AmbushEnv = Partial<
    Record<(typeof AMBUSH_ENV_KEYS)[number], string>
>;

export interface AmbushConfig {
    timeZone: string;
}

export function parseAmbushConfig(env: AmbushEnv): AmbushConfig {
    const raw = (env.AMBUSH_TIMEZONE ?? '').trim() || DEFAULT_AMBUSH_TIMEZONE;
    try {
        return {
            timeZone: new Intl.DateTimeFormat('en-US', {
                timeZone: raw,
            }).resolvedOptions().timeZone,
        };
    } catch {
        throw new Error(
            'AMBUSH_TIMEZONE must be an IANA time zone (empty = Europe/Rome)',
        );
    }
}

export function readAmbushEnv(source: Record<string, unknown>): AmbushEnv {
    return readEnvKeys(source, AMBUSH_ENV_KEYS);
}

export const ambushConfigProvider: FactoryProvider<AmbushConfig> = {
    provide: AMBUSH_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseAmbushConfig(
            readAmbushEnv({
                AMBUSH_TIMEZONE: config.get<string>('AMBUSH_TIMEZONE'),
            }),
        ),
};
