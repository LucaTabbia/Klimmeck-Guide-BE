import type { BaseMessage } from 'firebase-admin/messaging';
import { PushMessage } from 'src/push/push-message';

const MILLISECONDS_PER_SECOND = 1000;

export type FcmBase = Required<Pick<BaseMessage, 'data' | 'android' | 'apns'>>;

// data-only (D-10): il FE gestisce i tre app state e applica i toggle prima della notifica locale
export function toFcmBase(message: PushMessage, now: Date): FcmBase {
    const data: Record<string, string> = {
        type: message.type,
        title: message.title,
        body: message.body,
        sentAt: now.toISOString(),
    };
    // mai undefined: un valore non stringa fa fallire ogni token con messaging/invalid-payload
    if (message.id) data.id = message.id;
    const expiresAtEpochSeconds =
        Math.floor(now.getTime() / MILLISECONDS_PER_SECOND) +
        message.ttlSeconds;
    return {
        data,
        android: {
            priority: 'high',
            ttl: message.ttlSeconds * MILLISECONDS_PER_SECOND, // ms: l'SDK lo converte in "3600s"
        },
        apns: {
            headers: {
                'apns-push-type': 'background',
                'apns-priority': '5', // 10 è rifiutato da Apple per il push type background
                'apns-expiration': String(expiresAtEpochSeconds), // epoch assoluto in secondi, non una durata
            },
            payload: { aps: { contentAvailable: true } }, // serializzato come "content-available": 1
        },
    };
}
