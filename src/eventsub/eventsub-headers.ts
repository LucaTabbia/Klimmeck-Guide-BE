import type { IncomingHttpHeaders } from 'node:http';

export const EVENTSUB_HEADER = {
    messageId: 'twitch-eventsub-message-id',
    timestamp: 'twitch-eventsub-message-timestamp',
    signature: 'twitch-eventsub-message-signature',
    messageType: 'twitch-eventsub-message-type',
} as const;

export const MAX_EVENTSUB_HEADER_LENGTH = 200;

export interface EventSubHeaders {
    messageId: string;
    timestamp: string;
    signature: string;
    messageType: string;
}

// il tipo di subscription si legge dal body firmato: gli header fuori dall'HMAC non decidono nulla
export function readEventSubHeaders(
    headers: IncomingHttpHeaders,
): EventSubHeaders | null {
    const messageId = readHeader(headers, EVENTSUB_HEADER.messageId);
    const timestamp = readHeader(headers, EVENTSUB_HEADER.timestamp);
    const signature = readHeader(headers, EVENTSUB_HEADER.signature);
    const messageType = readHeader(headers, EVENTSUB_HEADER.messageType);
    if (!messageId || !timestamp || !signature || !messageType) return null;
    return { messageId, timestamp, signature, messageType };
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | null {
    const value = headers[name];
    if (typeof value !== 'string') return null;
    if (value.length === 0) return null;
    if (value.length > MAX_EVENTSUB_HEADER_LENGTH) return null;
    return value;
}
