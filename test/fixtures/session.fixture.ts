import { Model, Types } from 'mongoose';
import { sha256Hex } from 'src/auth/crypto/token-crypto';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

/**
 * Two-tier Session fixture. Stores only a hash of a fake token, never a real
 * refresh token. expiresAt is relative to real time: a fixed past date would
 * be reaped by the Mongo TTL monitor in the middle of a test.
 * Valid against src/auth/session/session.model.ts.
 */
export function buildSession(overrides: Record<string, any> = {}) {
    return {
        userId: new Types.ObjectId('64b0000000000000000000a1'),
        refreshTokenHash: sha256Hex('fixture-refresh-token'),
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
        ...overrides,
    };
}

export async function persistSession(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildSession(overrides));
}
