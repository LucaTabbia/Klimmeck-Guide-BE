import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';
import {
    DEFAULT_SWEEP_INTERVAL_MS,
    parseSweepIntervalMs,
} from 'src/config/sweep-interval';

export const TRAVEL_CONFIG = 'TRAVEL_CONFIG';
export const DEFAULT_TRAVEL_SWEEP_INTERVAL_MS = DEFAULT_SWEEP_INTERVAL_MS;

export const TRAVEL_ENV_KEYS = ['TRAVEL_SWEEP_INTERVAL_MS'] as const;

export type TravelEnv = Partial<
    Record<(typeof TRAVEL_ENV_KEYS)[number], string>
>;

export interface TravelConfig {
    sweepIntervalMs: number;
}

// opzionale con default; 0 spegne solo lo sweep periodico, il reconciler al boot gira sempre (D-12); messaggio senza valore
export function parseTravelConfig(env: TravelEnv): TravelConfig {
    return {
        sweepIntervalMs: parseSweepIntervalMs(
            'TRAVEL_SWEEP_INTERVAL_MS',
            env.TRAVEL_SWEEP_INTERVAL_MS,
        ),
    };
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
