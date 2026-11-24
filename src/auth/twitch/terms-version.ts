// versione dei documenti accettata (Phase 26 D-12, D-19): stringa dell'app, solo forma
export const TERMS_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export function isTermsVersion(value: unknown): value is string {
    return typeof value === 'string' && TERMS_VERSION_PATTERN.test(value);
}
