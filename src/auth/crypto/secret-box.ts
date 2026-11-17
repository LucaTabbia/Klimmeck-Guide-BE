import {
    createCipheriv,
    createDecipheriv,
    hkdfSync,
    randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SEALED_PARTS = 3;

// una chiave per scopo, derivata dal secret dell'app: cambiare il secret rende illeggibile ciò che è stato sigillato
export function deriveSecretBoxKey(secret: string, purpose: string): Buffer {
    return Buffer.from(
        hkdfSync('sha256', secret, Buffer.alloc(0), purpose, KEY_BYTES),
    );
}

export function sealSecret(secret: string, key: Buffer): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data]
        .map((part) => part.toString('base64url'))
        .join('.');
}

// null su valore malformato, manomesso o sigillato con un'altra chiave
export function openSecret(sealed: string, key: Buffer): string | null {
    const parts = sealed.split('.');
    if (parts.length !== SEALED_PARTS) return null;
    const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
    try {
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([
            decipher.update(data),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        return null;
    }
}
