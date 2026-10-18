import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey } from 'node:crypto';
import { readEnvKeys } from 'src/config/env-keys';

export const PUSH_CONFIG = 'PUSH_CONFIG';

export const PUSH_ENV_KEYS = ['NODE_ENV', 'FIREBASE_SERVICE_ACCOUNT'] as const;

export type PushEnv = Partial<Record<(typeof PUSH_ENV_KEYS)[number], string>>;

export interface FirebaseServiceAccount {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

export interface PushConfig {
    serviceAccount: FirebaseServiceAccount | null;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_BLOCK_LENGTH = 4;
const REQUIRED_FIELDS = ['project_id', 'client_email', 'private_key'] as const;

type ServiceAccountJson = Record<(typeof REQUIRED_FIELDS)[number], string>;

// messaggi fissi: né il valore né la chiave privata finiscono mai in un errore o in un log (D-06)
export function parsePushConfig(env: PushEnv): PushConfig {
    const encoded = (env.FIREBASE_SERVICE_ACCOUNT ?? '').replace(/\s+/g, '');
    if (!encoded) return disabledPushConfig(env);

    const json = requireServiceAccountFields(decodeServiceAccount(encoded));
    assertPemPrivateKey(json.private_key);
    return {
        serviceAccount: {
            projectId: json.project_id,
            clientEmail: json.client_email,
            privateKey: json.private_key,
        },
    };
}

export function readPushEnv(source: Record<string, unknown>): PushEnv {
    return readEnvKeys(source, PUSH_ENV_KEYS);
}

export const pushConfigProvider: FactoryProvider<PushConfig> = {
    provide: PUSH_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parsePushConfig(
            readPushEnv(
                Object.fromEntries(
                    PUSH_ENV_KEYS.map((key) => [key, config.get<string>(key)]),
                ),
            ),
        ),
};

function disabledPushConfig(env: PushEnv): PushConfig {
    if (env.NODE_ENV === 'production') {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT is required when NODE_ENV=production',
        );
    }
    return { serviceAccount: null };
}

function decodeServiceAccount(encoded: string): Record<string, unknown> {
    if (
        !BASE64_PATTERN.test(encoded) ||
        encoded.length % BASE64_BLOCK_LENGTH !== 0
    ) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT must be the base64 encoding of the service account JSON',
        );
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT does not decode to valid JSON',
        );
    }
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT does not decode to a JSON object',
        );
    }
    return parsed as Record<string, unknown>;
}

function requireServiceAccountFields(
    json: Record<string, unknown>,
): ServiceAccountJson {
    for (const field of REQUIRED_FIELDS) {
        const value = json[field];
        if (typeof value !== 'string' || value === '') {
            throw new Error(
                `FIREBASE_SERVICE_ACCOUNT is missing the "${field}" field`,
            );
        }
    }
    return json as ServiceAccountJson;
}

function assertPemPrivateKey(privateKey: string): void {
    try {
        createPrivateKey(privateKey);
    } catch {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT private_key is not a valid PEM private key',
        );
    }
}
