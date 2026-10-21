import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

export const TRAVEL_CONFIG = 'TRAVEL_CONFIG';
export const DEFAULT_TRAVEL_SWEEP_INTERVAL_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647; // oltre, setInterval di Node scatta subito
const DIGITS = /^\d+$/;

export const TRAVEL_ENV_KEYS = ['TRAVEL_SWEEP_INTERVAL_MS'] as const;

export type TravelEnv = Partial<
    Record<(typeof TRAVEL_ENV_KEYS)[number], string>
>;

export interface TravelConfig {
    sweepIntervalMs: number;
}

// opzionale con default; 0 spegne solo lo sweep periodico, il reconciler al boot gira sempre (D-12); messaggio senza valore
export function parseTravelConfig(env: TravelEnv): TravelConfig {
    const value = (env.TRAVEL_SWEEP_INTERVAL_MS ?? '').trim();
    if (!value) return { sweepIntervalMs: DEFAULT_TRAVEL_SWEEP_INTERVAL_MS };
    if (!DIGITS.test(value) || Number(value) > MAX_TIMER_MS) {
        throw new Error(
            'TRAVEL_SWEEP_INTERVAL_MS must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)',
        );
    }
    return { sweepIntervalMs: Number(value) };
}

export function readTravelEnv(source: Record<string, unknown>): TravelEnv {
    return readEnvKeys(source, TRAVEL_ENV_KEYS);
}

export const travelConfigProvider: FactoryProvider<TravelConfig> = {
    provide: TRAVEL_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseTravelConfig(
            readTravelEnv({
                TRAVEL_SWEEP_INTERVAL_MS: config.get<string>(
                    'TRAVEL_SWEEP_INTERVAL_MS',
                ),
            }),
        ),
};
