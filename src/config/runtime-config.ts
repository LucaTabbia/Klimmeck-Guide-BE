import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

export const RUNTIME_CONFIG = 'RUNTIME_CONFIG';

export const RUNTIME_ENV_KEYS = ['NODE_ENV'] as const;

export const RUNTIME_MODES = ['development', 'test', 'production'] as const;

export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export type RuntimeEnv = Partial<
    Record<(typeof RUNTIME_ENV_KEYS)[number], string>
>;

export interface RuntimeConfig {
    mode: RuntimeMode;
    production: boolean;
    modeDefaulted: boolean;
}

const DEFAULT_MODE: RuntimeMode = 'development';

// messaggio fisso: il valore rifiutato non finisce mai nell'errore (C20)
export function parseRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
    const value = (env.NODE_ENV ?? '').trim();
    if (!value) return runtimeConfigOf(DEFAULT_MODE, true);
    if (!isRuntimeMode(value)) {
        throw new Error(
            'NODE_ENV must be one of development, test, production (staging uses production)',
        );
    }
    return runtimeConfigOf(value, false);
}

export function readRuntimeEnv(source: Record<string, unknown>): RuntimeEnv {
    return readEnvKeys(source, RUNTIME_ENV_KEYS);
}

export const runtimeConfigProvider: FactoryProvider<RuntimeConfig> = {
    provide: RUNTIME_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseRuntimeConfig(
            readRuntimeEnv(
                Object.fromEntries(
                    RUNTIME_ENV_KEYS.map((key) => [
                        key,
                        config.get<string>(key),
                    ]),
                ),
            ),
        ),
};

function isRuntimeMode(value: string): value is RuntimeMode {
    return (RUNTIME_MODES as readonly string[]).includes(value);
}

function runtimeConfigOf(
    mode: RuntimeMode,
    modeDefaulted: boolean,
): RuntimeConfig {
    return { mode, production: mode === 'production', modeDefaulted };
}
