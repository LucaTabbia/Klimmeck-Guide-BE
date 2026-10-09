export const DUPLICATE_KEY_ERROR_CODE = 11000;

type KeyPattern = Record<string, unknown>;

export function isDuplicateKeyError(error: unknown): boolean {
    return mongoErrorCodeOf(error) === DUPLICATE_KEY_ERROR_CODE;
}

// legge solo keyPattern: con un indice collation l'altra chiave del driver è una chiave ICU opaca e non va mai esposta
export function isDuplicateKeyOn(error: unknown, path: string): boolean {
    if (!isDuplicateKeyError(error)) return false;
    const keyPattern = keyPatternOf(error);
    return keyPattern !== undefined && Object.hasOwn(keyPattern, path);
}

export function describeMongoError(error: unknown): string {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code = mongoErrorCodeOf(error);
    return code === undefined ? name : `${name}, code ${code}`;
}

function mongoErrorCodeOf(error: unknown): number | string | undefined {
    if (!isObject(error)) return undefined;
    const { code } = error as { code?: unknown };
    return typeof code === 'number' || typeof code === 'string'
        ? code
        : undefined;
}

function keyPatternOf(error: unknown): KeyPattern | undefined {
    if (!isObject(error)) return undefined;
    const { keyPattern, errorResponse } = error as {
        keyPattern?: unknown;
        errorResponse?: unknown;
    };
    if (isObject(keyPattern)) return keyPattern;
    if (!isObject(errorResponse)) return undefined;
    const nested = (errorResponse as { keyPattern?: unknown }).keyPattern;
    return isObject(nested) ? nested : undefined;
}

function isObject(value: unknown): value is KeyPattern {
    return typeof value === 'object' && value !== null;
}
