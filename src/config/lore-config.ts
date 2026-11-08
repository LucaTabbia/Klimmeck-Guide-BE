import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

// probabilità dello studio (Phase 16 D-08): opzionale, vuota = 0.5, numero in [0, 1] validato al boot; non è un segreto

export const LORE_CONFIG = 'LORE_CONFIG';
export const DEFAULT_LORE_STUDY_CHANCE = 0.5;

export const LORE_ENV_KEYS = ['LORE_STUDY_CHANCE'] as const;

export type LoreEnv = Partial<Record<(typeof LORE_ENV_KEYS)[number], string>>;

export interface LoreConfig {
    studyChance: number;
}

export function parseLoreConfig(env: LoreEnv): LoreConfig {
    const raw = (env.LORE_STUDY_CHANCE ?? '').trim();
    if (!raw) return { studyChance: DEFAULT_LORE_STUDY_CHANCE };
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(
            'LORE_STUDY_CHANCE must be a number between 0 and 1 (empty = 0.5)',
        );
    }
    return { studyChance: value };
}

export function readLoreEnv(source: Record<string, unknown>): LoreEnv {
    return readEnvKeys(source, LORE_ENV_KEYS);
}

// opzionale come ambushConfigProvider: gli harness nudi senza ConfigModule ricevono il default (trappola 15-03)
export const loreConfigProvider: FactoryProvider<LoreConfig> = {
    provide: LORE_CONFIG,
    inject: [{ token: ConfigService, optional: true }],
    useFactory: (config: ConfigService | undefined) =>
        parseLoreConfig(
            readLoreEnv({
                LORE_STUDY_CHANCE: config?.get<string>('LORE_STUDY_CHANCE'),
            }),
        ),
};
