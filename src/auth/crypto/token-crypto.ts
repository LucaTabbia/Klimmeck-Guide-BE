import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const OPAQUE_TOKEN_BYTES = 32;

export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export function generateOpaqueToken(): string {
    return randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
}

export function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function s256Challenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
    return timingSafeEqual(sha256Digest(a), sha256Digest(b));
}

function sha256Digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}
