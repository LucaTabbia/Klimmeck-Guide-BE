import { DeletedAccountRegistry } from 'src/auth/session/deleted-account.registry';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildTestAuthConfig } from '../../../test/auth/test-auth-config';

const ACCOUNT_A = '64b0000000000000000000d1';
const ACCOUNT_B = '64b0000000000000000000d2';
const ACCESS_TOKEN_TTL_SECONDS = 900;

describe('DeletedAccountRegistry', () => {
    let clock: FixedClock;
    let registry: DeletedAccountRegistry;

    beforeEach(() => {
        clock = new FixedClock(new Date('2026-11-25T10:00:00.000Z'));
        registry = new DeletedAccountRegistry(
            buildTestAuthConfig({
                accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
            }),
            clock,
        );
    });

    it('remembers a deleted account for the access token lifetime (D-18)', () => {
        registry.mark(ACCOUNT_A);
        expect(registry.isDeleted(ACCOUNT_A)).toBe(true);

        clock.advanceSeconds(ACCESS_TOKEN_TTL_SECONDS - 1);
        expect(registry.isDeleted(ACCOUNT_A)).toBe(true);

        clock.advanceSeconds(1);
        expect(registry.isDeleted(ACCOUNT_A)).toBe(false);
    });

    it('knows only the accounts it was told (D-18)', () => {
        registry.mark(ACCOUNT_A);

        expect(registry.isDeleted(ACCOUNT_B)).toBe(false);
    });

    it('forgets expired accounts when a new one is marked (D-18)', () => {
        registry.mark(ACCOUNT_A);
        clock.advanceSeconds(ACCESS_TOKEN_TTL_SECONDS);

        registry.mark(ACCOUNT_B);

        expect(registry.isDeleted(ACCOUNT_A)).toBe(false);
        expect(registry.isDeleted(ACCOUNT_B)).toBe(true);
    });

    it('restarts the window when the same account is marked again (D-18)', () => {
        registry.mark(ACCOUNT_A);
        clock.advanceSeconds(ACCESS_TOKEN_TTL_SECONDS - 1);

        registry.mark(ACCOUNT_A);
        clock.advanceSeconds(ACCESS_TOKEN_TTL_SECONDS - 1);

        expect(registry.isDeleted(ACCOUNT_A)).toBe(true);
    });
});
