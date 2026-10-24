import type { AuthTestApp } from '../auth/auth-test-app';

export async function primePendingRequestsChangeStream(
    harness: AuthTestApp,
): Promise<void> {
    await harness.clearDatabase();
}
