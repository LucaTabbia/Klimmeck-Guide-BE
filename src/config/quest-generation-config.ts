import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';
import { parseSweepIntervalMs } from 'src/config/sweep-interval';

export const QUEST_GENERATION_CONFIG = 'QUEST_GENERATION_CONFIG';
export const DEFAULT_QUEST_GENERATION_SWEEP_INTERVAL_MS = 3_600_000;
export const MAX_QUEST_GENERATION_TARGET = 10_000;

export const QUEST_GENERATION_ENV_KEYS = [
    'QUEST_GENERATION_SWEEP_INTERVAL_MS',
    'QUEST_GENERATION_TARGET',
] as const;

export type QuestGenerationEnv = Partial<
    Record<(typeof QUEST_GENERATION_ENV_KEYS)[number], string>
>;

export interface QuestGenerationConfig {
    sweepIntervalMs: number;
    // null = numero delle città a DB al momento della corsa (D-15)
    target: number | null;
}

const DIGITS = /^\d+$/;

// fail-closed al boot con messaggi che non riportano il valore (D-15, D-17)
export function parseQuestGenerationConfig(
    env: QuestGenerationEnv,
): QuestGenerationConfig {
    return {
        sweepIntervalMs: parseSweepIntervalMs(
            'QUEST_GENERATION_SWEEP_INTERVAL_MS',
            env.QUEST_GENERATION_SWEEP_INTERVAL_MS,
            DEFAULT_QUEST_GENERATION_SWEEP_INTERVAL_MS,
        ),
        target: parseTarget(env.QUEST_GENERATION_TARGET),
    };
}

function parseTarget(raw: string | undefined): number | null {
    const value = (raw ?? '').trim();
    if (!value) return null;
    if (!DIGITS.test(value) || Number(value) > MAX_QUEST_GENERATION_TARGET) {
        throw new Error(
            `QUEST_GENERATION_TARGET must be an integer between 0 and ${MAX_QUEST_GENERATION_TARGET} (empty = one generated quest per city)`,
        );
    }
    return Number(value);
}

export function readQuestGenerationEnv(
    source: Record<string, unknown>,
): QuestGenerationEnv {
    return readEnvKeys(source, QUEST_GENERATION_ENV_KEYS);
}

export const questGenerationConfigProvider: FactoryProvider<QuestGenerationConfig> =
    {
        provide: QUEST_GENERATION_CONFIG,
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
            parseQuestGenerationConfig(
                readQuestGenerationEnv({
                    QUEST_GENERATION_SWEEP_INTERVAL_MS: config.get<string>(
                        'QUEST_GENERATION_SWEEP_INTERVAL_MS',
                    ),
                    QUEST_GENERATION_TARGET: config.get<string>(
                        'QUEST_GENERATION_TARGET',
                    ),
                }),
            ),
    };
