import { Types } from 'mongoose';
import { DevAuthStrategy } from 'src/auth/dev/dev-auth.strategy';
import type { UsersService } from 'src/users/users.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    buildTestAuthConfig,
    TEST_DEV_ACCESS_TOKEN,
    TEST_DEV_TWITCH_ID,
} from '../../../test/auth/test-auth-config';

const STUB_USER_ID = new Types.ObjectId();

function buildStubUser() {
    return {
        _id: STUB_USER_ID,
        twitchId: TEST_DEV_TWITCH_ID,
        role: RoleType.adventurer,
    };
}

describe('DevAuthStrategy', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    let usersService: { upsertWithRole: jest.Mock };

    function buildStrategy(
        devAuth = buildTestAuthConfig().devAuth,
    ): DevAuthStrategy {
        return new DevAuthStrategy(
            buildTestAuthConfig({ devAuth }),
            usersService as unknown as UsersService,
        );
    }

    beforeEach(() => {
        usersService = {
            upsertWithRole: jest.fn().mockResolvedValue(buildStubUser()),
        };
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('returns null when the dev bypass is disabled', async () => {
        const strategy = buildStrategy(null);

        await expect(
            strategy.tryResolve(TEST_DEV_ACCESS_TOKEN),
        ).resolves.toBeNull();
        expect(usersService.upsertWithRole).not.toHaveBeenCalled();
    });

    it('resolves the dev token to the stub user identity without session or expiry', async () => {
        const identity = await buildStrategy().tryResolve(
            TEST_DEV_ACCESS_TOKEN,
        );

        expect(identity).toEqual({
            userId: STUB_USER_ID.toString(),
            twitchId: TEST_DEV_TWITCH_ID,
            role: RoleType.adventurer,
        });
        expect(usersService.upsertWithRole).toHaveBeenCalledWith(
            TEST_DEV_TWITCH_ID,
            RoleType.adventurer,
        );
    });

    it('returns null for a wrong token of the same length', async () => {
        const wrongToken = 'X'.repeat(TEST_DEV_ACCESS_TOKEN.length);

        await expect(
            buildStrategy().tryResolve(wrongToken),
        ).resolves.toBeNull();
        expect(usersService.upsertWithRole).not.toHaveBeenCalled();
    });

    it('returns null without throwing for a token of a different length', async () => {
        await expect(buildStrategy().tryResolve('x')).resolves.toBeNull();
    });

    it('returns null when NODE_ENV is production at runtime (defense in depth)', async () => {
        const strategy = buildStrategy();
        process.env.NODE_ENV = 'production';

        await expect(
            strategy.tryResolve(TEST_DEV_ACCESS_TOKEN),
        ).resolves.toBeNull();
        expect(usersService.upsertWithRole).not.toHaveBeenCalled();
    });

    it('memoizes the stub user upsert across calls', async () => {
        const strategy = buildStrategy();

        await strategy.tryResolve(TEST_DEV_ACCESS_TOKEN);
        await strategy.tryResolve(TEST_DEV_ACCESS_TOKEN);

        expect(usersService.upsertWithRole).toHaveBeenCalledTimes(1);
    });

    it('retries the upsert after a failed attempt', async () => {
        usersService.upsertWithRole
            .mockRejectedValueOnce(new Error('db down'))
            .mockResolvedValueOnce(buildStubUser());
        const strategy = buildStrategy();

        await expect(
            strategy.tryResolve(TEST_DEV_ACCESS_TOKEN),
        ).rejects.toThrow('db down');
        await expect(
            strategy.tryResolve(TEST_DEV_ACCESS_TOKEN),
        ).resolves.toMatchObject({ userId: STUB_USER_ID.toString() });
        expect(usersService.upsertWithRole).toHaveBeenCalledTimes(2);
    });
});
