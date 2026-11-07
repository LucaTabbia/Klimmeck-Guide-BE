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

const INVALID_AMBUSH_TIMEZONE =
    'AMBUSH_TIMEZONE must be an IANA time zone (empty = Europe/Rome)';

// un offset fisso (+02:00) passa da Intl ma ignora l'ora legale: la notte 22–06 si sposterebbe per metà anno (D-01)
const isFixedOffset = (timeZone: string): boolean => /^[+-]/.test(timeZone);

export function parseAmbushConfig(env: AmbushEnv): AmbushConfig {
    const raw = (env.AMBUSH_TIMEZONE ?? '').trim() || DEFAULT_AMBUSH_TIMEZONE;
    const timeZone = canonicalTimeZoneOf(raw);
    if (isFixedOffset(timeZone)) throw new Error(INVALID_AMBUSH_TIMEZONE);
    return { timeZone };
}

function canonicalTimeZoneOf(raw: string): string {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: raw,
        }).resolvedOptions().timeZone;
    } catch {
        throw new Error(INVALID_AMBUSH_TIMEZONE);
    }
}

export function readAmbushEnv(source: Record<string, unknown>): AmbushEnv {
    return readEnvKeys(source, AMBUSH_ENV_KEYS);
}

// opzionale: TravelPlanningModule vive anche negli harness nudi senza ConfigModule (accettazione); senza servizio vale il default, nell'app il ConfigModule globale c'è sempre
export const ambushConfigProvider: FactoryProvider<AmbushConfig> = {
    provide: AMBUSH_CONFIG,
    inject: [{ token: ConfigService, optional: true }],
    useFactory: (config: ConfigService | undefined) =>
        parseAmbushConfig(
            readAmbushEnv({
                AMBUSH_TIMEZONE: config?.get<string>('AMBUSH_TIMEZONE'),
            }),
        ),
};
