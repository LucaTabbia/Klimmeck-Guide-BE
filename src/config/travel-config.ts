import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

export const TRAVEL_CONFIG = 'TRAVEL_CONFIG';
export const DEFAULT_TRAVEL_SWEEP_INTERVAL_MS = 0;

export const TRAVEL_ENV_KEYS = ['TRAVEL_SWEEP_INTERVAL_MS'] as const;

export type TravelEnv = Partial<
    Record<(typeof TRAVEL_ENV_KEYS)[number], string>
>;

export interface TravelConfig {
    sweepIntervalMs: number;
}

export function parseTravelConfig(_env: TravelEnv): TravelConfig {
    throw new Error('not implemented');
}

export function readTravelEnv(source: Record<string, unknown>): TravelEnv {
    return readEnvKeys(source, []);
}

export const travelConfigProvider: FactoryProvider<TravelConfig> = {
    provide: TRAVEL_CONFIG,
    inject: [ConfigService],
    useFactory: () => parseTravelConfig({}),
};
