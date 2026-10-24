import type { AuthTestApp } from '../auth/auth-test-app';

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si inserisce finché un evento arriva
export function primeQuestResultsChangeStream(
    _harness: AuthTestApp,
): Promise<void> {
    return Promise.reject(new Error('not implemented'));
}
