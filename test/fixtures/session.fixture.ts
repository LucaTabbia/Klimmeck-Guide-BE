import { Model, Types } from 'mongoose';
import { sha256Hex } from 'src/auth/crypto/token-crypto';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

/**
 * Two-tier Session fixture. Stores only a hash of a fake token, never a real
 * refresh token. expiresAt is relative to real time: a fixed past date would
 * be reaped by the Mongo TTL monitor in the middle of a test.
 * The fake current token is not derived from tokenSeed: a fixture session
 * created with retiredRefreshTokens cannot re-issue it inside the grace window
 * (D-35). Once rotated, its new token is derived and can be re-issued.
 * Valid against src/auth/session/session.model.ts.
 */
export function buildSession(overrides: Record<string, any> = {}) {
    return {
        userId: new Types.ObjectId('64b0000000000000000000a1'),
        refreshTokenHash: sha256Hex('fixture-refresh-token'),
        tokenSeed: 'fixture-token-seed',
        rotationCount: 0,
        retiredRefreshTokens: [],
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
