import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';
import {
    DEFAULT_SWEEP_INTERVAL_MS,
    parseSweepIntervalMs,
} from 'src/config/sweep-interval';

export const QUEST_CONFIG = 'QUEST_CONFIG';
export const DEFAULT_QUEST_SWEEP_INTERVAL_MS = DEFAULT_SWEEP_INTERVAL_MS;

export const QUEST_ENV_KEYS = ['QUEST_SWEEP_INTERVAL_MS'] as const;

export type QuestEnv = Partial<Record<(typeof QUEST_ENV_KEYS)[number], string>>;

export interface QuestConfig {
    sweepIntervalMs: number;
}

// opzionale con default; 0 spegne solo lo sweep periodico, il reconciler al boot gira sempre (D-24)
export function parseQuestConfig(env: QuestEnv): QuestConfig {
    return {
        sweepIntervalMs: parseSweepIntervalMs(
            'QUEST_SWEEP_INTERVAL_MS',
            env.QUEST_SWEEP_INTERVAL_MS,
        ),
    };
}

export function readQuestEnv(source: Record<string, unknown>): QuestEnv {
    return readEnvKeys(source, QUEST_ENV_KEYS);
}

export const questConfigProvider: FactoryProvider<QuestConfig> = {
    provide: QUEST_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseQuestConfig(
            readQuestEnv({
                QUEST_SWEEP_INTERVAL_MS: config.get<string>(
                    'QUEST_SWEEP_INTERVAL_MS',
                ),
            }),
        ),
};
