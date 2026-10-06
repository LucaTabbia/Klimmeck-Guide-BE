import { createHmac, hkdfSync } from 'node:crypto';

const REFRESH_TOKEN_KEY_INFO = 'klimmeck/refresh-token/v1';
const REFRESH_TOKEN_KEY_BYTES = 32;
const NO_SALT = Buffer.alloc(0);

// chiave dedicata derivata con HKDF: il secret dei JWT non è mai usato direttamente come chiave HMAC (D-35)
export function deriveRefreshTokenKey(jwtSecret: string): Buffer {
    return Buffer.from(
        hkdfSync(
            'sha256',
            jwtSecret,
            NO_SALT,
            REFRESH_TOKEN_KEY_INFO,
            REFRESH_TOKEN_KEY_BYTES,
        ),
    );
}

// l'array serializzato in JSON rende l'input non ambiguo tra i tre campi
export function deriveRefreshToken(
    key: Buffer,
    sessionId: string,
    rotationCount: number,
    tokenSeed: string,
): string {
    return createHmac('sha256', key)
        .update(JSON.stringify([sessionId, rotationCount, tokenSeed]))
        .digest('base64url');
}
