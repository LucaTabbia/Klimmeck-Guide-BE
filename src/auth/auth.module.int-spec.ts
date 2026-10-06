import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { User } from 'src/models/user.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import {
    TEST_DEV_ACCESS_TOKEN,
    TEST_DEV_TWITCH_ID,
} from '../../test/auth/test-auth-config';
import { persistUser } from '../../test/fixtures';

const DEV_BEARER = `Bearer ${TEST_DEV_ACCESS_TOKEN}`;

describe('AuthModule wiring (test harness)', () => {
    describe('with the dev bypass enabled', () => {
        let harness: AuthTestApp;

        beforeAll(async () => {
            harness = await createAuthTestApp();
        });

        afterEach(async () => {
            await harness.clearDatabase();
        });

        afterAll(async () => {
            await harness.close();
        });

        it('listens on an ephemeral port', () => {
            expect(harness.port).toBeGreaterThan(0);
        });

        it('resolves the dev bearer and creates the dev user on the Nest connection', async () => {
            const identity = await harness.app
                .get(AuthIdentityResolver)
                .resolveBearer(DEV_BEARER);

            const users = harness.connection.model(User.name);
            const stored = await users
                .findOne({ twitchId: TEST_DEV_TWITCH_ID })
                .exec();
            expect(identity.twitchId).toBe(TEST_DEV_TWITCH_ID);
            expect(identity.userId).toBe(String(stored?._id));
        });

        it('clearDatabase removes what the app created', async () => {
            const users = harness.connection.model(User.name);
            await persistUser(users, { twitchId: 'twitch-cleared-1' });
            expect(await users.countDocuments()).toBe(1);

            await harness.clearDatabase();

            expect(await users.countDocuments()).toBe(0);
        });
    });

    describe('with the dev bypass disabled', () => {
        let harness: AuthTestApp;

        beforeAll(async () => {
            harness = await createAuthTestApp({
                authConfig: { devAuth: null },
            });
        });

        afterAll(async () => {
            await harness.close();
        });

        it('rejects the dev bearer as UNAUTHENTICATED', async () => {
            await expect(
                harness.app.get(AuthIdentityResolver).resolveBearer(DEV_BEARER),
            ).rejects.toMatchObject({ code: AuthErrorCode.UNAUTHENTICATED });
        });
    });
});
