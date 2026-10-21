import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnvKeys } from 'src/config/env-keys';
import {
    hasWhitespaceOrControlCharacter,
    LOOPBACK_HOSTNAMES,
    parseUrl,
} from 'src/config/url-rules';

export const EVENTSUB_CONFIG = 'EVENTSUB_CONFIG';

export const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;

export const TWITCH_USER_ID_PATTERN = /^\d{1,20}$/;

export const EVENTSUB_ENV_KEYS = [
    'NODE_ENV',
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
    'TWITCH_EVENTSUB_SECRET',
    'TWITCH_EVENTSUB_CALLBACK_URL',
    'TWITCH_BROADCASTER_ID',
] as const;

export type EventSubEnv = Partial<
    Record<(typeof EVENTSUB_ENV_KEYS)[number], string>
>;

export interface EventSubWebhookConfig {
    secret: string;
    callbackUrl: string;
    broadcasterId: string;
}

export interface DisabledEventSubConfig {
    mode: 'disabled';
}

export interface LocalEventSubConfig extends EventSubWebhookConfig {
    mode: 'local';
}

export interface ManagedEventSubConfig extends EventSubWebhookConfig {
    mode: 'managed';
    clientId: string;
    clientSecret: string;
    reconcileIntervalMs: number;
}

export type EventSubConfig =
    | DisabledEventSubConfig
    | LocalEventSubConfig
    | ManagedEventSubConfig;

const WEBHOOK_KEYS = [
    'TWITCH_EVENTSUB_SECRET',
    'TWITCH_EVENTSUB_CALLBACK_URL',
    'TWITCH_BROADCASTER_ID',
] as const;

const EVENTSUB_SECRET_PATTERN = /^[\x21-\x7E]{10,100}$/;

type CallbackMode = 'local' | 'managed';

interface ParsedCallback {
    mode: CallbackMode;
    callbackUrl: string;
}

// messaggi fissi: nominano variabile e regola, mai il valore (D-12); callback non https = modalità locale senza Helix (C3)
export function parseEventSubConfig(env: EventSubEnv): EventSubConfig {
    const missing = WEBHOOK_KEYS.filter((key) => isBlank(env[key]));
    if (missing.length === WEBHOOK_KEYS.length) return disabledConfig(env);
    if (missing.length > 0) {
        throw new Error(
            `EventSub configuration is incomplete: missing ${missing.join(', ')} (set TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID together, or none)`,
        );
    }

    const secret = parseSecret(env.TWITCH_EVENTSUB_SECRET ?? '');
    const { mode, callbackUrl } = parseCallback(env);
    const broadcasterId = parseBroadcasterId(env.TWITCH_BROADCASTER_ID ?? '');
    const webhook: EventSubWebhookConfig = {
        secret,
        callbackUrl,
        broadcasterId,
    };
    if (mode === 'local') return { mode, ...webhook };
    return {
        mode,
        ...webhook,
        ...parseAppCredentials(env),
        reconcileIntervalMs: RECONCILE_INTERVAL_MS,
    };
}

export function readEventSubEnv(source: Record<string, unknown>): EventSubEnv {
    return readEnvKeys(source, EVENTSUB_ENV_KEYS);
}

export const eventSubConfigProvider: FactoryProvider<EventSubConfig> = {
    provide: EVENTSUB_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parseEventSubConfig(
            readEventSubEnv(
                Object.fromEntries(
                    EVENTSUB_ENV_KEYS.map((key) => [
                        key,
                        config.get<string>(key),
                    ]),
                ),
            ),
        ),
};

function isBlank(value: string | undefined): boolean {
    return (value ?? '').trim() === '';
}

function disabledConfig(env: EventSubEnv): DisabledEventSubConfig {
    if (env.NODE_ENV === 'production') {
        throw new Error(
            'TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID are required when NODE_ENV=production',
        );
    }
    return { mode: 'disabled' };
}

function parseSecret(secret: string): string {
    if (!EVENTSUB_SECRET_PATTERN.test(secret)) {
        throw new Error(
            'TWITCH_EVENTSUB_SECRET must be 10-100 printable ASCII characters without spaces',
        );
    }
    return secret;
}

function parseCallback(env: EventSubEnv): ParsedCallback {
    const url = parseCallbackUrl(env.TWITCH_EVENTSUB_CALLBACK_URL ?? '');
    const mode = url && callbackModeOf(url, env.NODE_ENV === 'production');
    if (!url || !mode) {
        throw new Error(
            'TWITCH_EVENTSUB_CALLBACK_URL must be an absolute https URL on port 443 without credentials or fragment (http://localhost or http://127.0.0.1 only outside production)',
        );
    }
    return { mode, callbackUrl: url.href };
}

function parseCallbackUrl(candidate: string): URL | null {
    if (hasWhitespaceOrControlCharacter(candidate)) return null;
    if (candidate.includes('#')) return null;
    const url = parseUrl(candidate);
    if (!url || url.username || url.password) return null;
    return url;
}

function callbackModeOf(url: URL, isProduction: boolean): CallbackMode | null {
    if (url.protocol === 'https:' && url.port === '') return 'managed';
    const isLocal =
        url.protocol === 'http:' && LOOPBACK_HOSTNAMES.includes(url.hostname);
    if (isLocal && !isProduction) return 'local';
    return null;
}

function parseBroadcasterId(broadcasterId: string): string {
    if (!TWITCH_USER_ID_PATTERN.test(broadcasterId)) {
        throw new Error(
            'TWITCH_BROADCASTER_ID must be the numeric Twitch user id of the channel',
        );
    }
    return broadcasterId;
}

function parseAppCredentials(
    env: EventSubEnv,
): Pick<ManagedEventSubConfig, 'clientId' | 'clientSecret'> {
    const clientId = env.TWITCH_CLIENT_ID ?? '';
    const clientSecret = env.TWITCH_CLIENT_SECRET ?? '';
    if (isBlank(clientId) || isBlank(clientSecret)) {
        throw new Error(
            'TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required when TWITCH_EVENTSUB_CALLBACK_URL is https (EventSub subscriptions are managed with an app access token)',
        );
    }
    return { clientId, clientSecret };
}
