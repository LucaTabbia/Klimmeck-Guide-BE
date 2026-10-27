import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';
import {
    DEFAULT_SWEEP_INTERVAL_MS,
    parseSweepIntervalMs,
} from 'src/config/sweep-interval';

export const SPELL_RECOVERY_CONFIG = 'SPELL_RECOVERY_CONFIG';
export const DEFAULT_SPELL_RECOVERY_SWEEP_INTERVAL_MS =
    DEFAULT_SWEEP_INTERVAL_MS;

export const SPELL_RECOVERY_ENV_KEYS = [
    'SPELL_RECOVERY_SWEEP_INTERVAL_MS',
] as const;

export type SpellRecoveryEnv = Partial<
    Record<(typeof SPELL_RECOVERY_ENV_KEYS)[number], string>
>;

export interface SpellRecoveryConfig {
    sweepIntervalMs: number;
}

// opzionale con default; 0 spegne solo lo sweep periodico, reconciler e migrazione al boot girano sempre (D-09)
export function parseSpellRecoveryConfig(
    env: SpellRecoveryEnv,
): SpellRecoveryConfig {
    return {
        sweepIntervalMs: parseSweepIntervalMs(
            'SPELL_RECOVERY_SWEEP_INTERVAL_MS',
            env.SPELL_RECOVERY_SWEEP_INTERVAL_MS,
        ),
    };
}

export function readSpellRecoveryEnv(
    source: Record<string, unknown>,
): SpellRecoveryEnv {
    return readEnvKeys(source, SPELL_RECOVERY_ENV_KEYS);
}

export const spellRecoveryConfigProvider: FactoryProvider<SpellRecoveryConfig> =
    {
        provide: SPELL_RECOVERY_CONFIG,
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
            parseSpellRecoveryConfig(
                readSpellRecoveryEnv({
                    SPELL_RECOVERY_SWEEP_INTERVAL_MS: config.get<string>(
                        'SPELL_RECOVERY_SWEEP_INTERVAL_MS',
                    ),
                }),
            ),
    };
