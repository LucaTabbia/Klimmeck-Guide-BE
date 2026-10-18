export function readEnvKeys<K extends string>(
    source: Record<string, unknown>,
    keys: readonly K[],
): Partial<Record<K, string>> {
    const env: Partial<Record<K, string>> = {};
    for (const key of keys) {
        const value = source[key];
        if (!isEnvScalar(value)) continue;
        env[key] = String(value);
    }
    return env;
}

function isEnvScalar(value: unknown): value is string | number | boolean {
    return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}
