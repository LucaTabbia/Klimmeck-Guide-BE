import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';

export const THROTTLE_CONFIG = 'THROTTLE_CONFIG';

export const THROTTLE_ENV_KEYS = [
    'THROTTLE_TTL_MS',
    'THROTTLE_LIMIT',
    'THROTTLE_TRUST_PROXY',
] as const;

// default della fase da far confermare all'utente prima della PR (D-08, A6)
export const DEFAULT_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_THROTTLE_LIMIT = 20;
// l'HMAC EventSub si verifica dopo le guard: il bucket del webhook deve essere molto più largo
export const WEBHOOK_LIMIT_FACTOR = 50;
// un numero di hop o un elenco di indirizzi/subnet per Express "trust proxy" (C19)
export const TRUST_PROXY_PATTERN = /^[0-9A-Za-z.:/, ]+$/;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export type ThrottleEnv = Partial<
    Record<(typeof THROTTLE_ENV_KEYS)[number], string>
>;

export interface ThrottleConfig {
    ttlMs: number;
    limit: number;
    webhookLimit: number;
    trustProxy: string | null;
}

// vuote = default; un valore malformato rifiuta il boot con un messaggio senza valore (D-08)
export function parseThrottleConfig(env: ThrottleEnv): ThrottleConfig {
    const limit = parsePositiveInteger(
        'THROTTLE_LIMIT',
        env.THROTTLE_LIMIT,
        DEFAULT_THROTTLE_LIMIT,
    );
    return {
        ttlMs: parsePositiveInteger(
            'THROTTLE_TTL_MS',
            env.THROTTLE_TTL_MS,
            DEFAULT_THROTTLE_TTL_MS,
        ),
        limit,
        webhookLimit: limit * WEBHOOK_LIMIT_FACTOR,
        trustProxy: parseTrustProxy(env.THROTTLE_TRUST_PROXY),
    };
}

export function readThrottleEnv(source: Record<string, unknown>): ThrottleEnv {
    return readEnvKeys(source, THROTTLE_ENV_KEYS);
}

export const throttleConfigProvider: FactoryProvider<ThrottleConfig> = {
    provide: THROTTLE_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseThrottleConfig(
            readThrottleEnv(
                Object.fromEntries(
                    THROTTLE_ENV_KEYS.map((key) => [
                        key,
                        config.get<string>(key),
                    ]),
                ),
            ),
        ),
};

function parsePositiveInteger(
    name: string,
    raw: string | undefined,
    fallback: number,
): number {
    const value = (raw ?? '').trim();
    if (!value) return fallback;
    if (!POSITIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error(`${name} must be a positive integer`);
    }
    return Number(value);
}

function parseTrustProxy(raw: string | undefined): string | null {
    const value = (raw ?? '').trim();
    if (!value) return null;
    if (!TRUST_PROXY_PATTERN.test(value)) {
        throw new Error(
            'THROTTLE_TRUST_PROXY must be a hop count or a list of addresses',
        );
    }
    return value;
}
