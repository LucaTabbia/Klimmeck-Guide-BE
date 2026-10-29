import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

// niente log injection: solo un alfabeto sicuro e lungo al più 64
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function requestIdFrom(header: unknown): string {
    if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) {
        return header;
    }
    return randomUUID();
}
