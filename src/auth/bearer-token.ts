const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function extractBearerToken(authorization: unknown): string | null {
    if (typeof authorization !== 'string') return null;
    return BEARER_PATTERN.exec(authorization.trim())?.[1] ?? null;
}
