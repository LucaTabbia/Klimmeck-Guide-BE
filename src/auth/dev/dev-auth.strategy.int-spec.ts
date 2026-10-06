import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { DevAuthStrategy } from 'src/auth/dev/dev-auth.strategy';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';
import {
    buildTestAuthConfig,
    TEST_DEV_ACCESS_TOKEN,
    TEST_DEV_TWITCH_ID,
} from '../../../test/auth/test-auth-config';
import { persistUser } from '../../../test/fixtures';

const UserModel: Model<UserDocument> =
    mongoose.models.User || mongoose.model(User.name, UserSchema);

describe('DevAuthStrategy with a real UsersService (replSet)', () => {
    let strategy: DevAuthStrategy;

    beforeAll(async () => {
        await UserModel.init();
    });

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                UsersService,
                DevAuthStrategy,
                { provide: getModelToken(User.name), useValue: UserModel },
                {
                    provide: AUTH_CONFIG,
                    useValue: buildTestAuthConfig({
                        devAuth: {
                            accessToken: TEST_DEV_ACCESS_TOKEN,
                            twitchId: TEST_DEV_TWITCH_ID,
                            role: RoleType.innkeeper,
                        },
                    }),
                },
            ],
        }).compile();
        strategy = moduleRef.get(DevAuthStrategy);
    });

    it('creates the stub user with the configured role and returns its id', async () => {
        const identity = await strategy.tryResolve(TEST_DEV_ACCESS_TOKEN);

        const stored = await UserModel.findOne({
            twitchId: TEST_DEV_TWITCH_ID,
        }).exec();
        expect(stored).not.toBeNull();
        expect(stored?.role).toBe(RoleType.innkeeper);
        expect(identity).toEqual({
            userId: stored?._id.toString(),
            twitchId: TEST_DEV_TWITCH_ID,
            role: RoleType.innkeeper,
        });
    });

    it('promotes an existing user to the configured role keeping its points', async () => {
        const existing = await persistUser(UserModel, {
            twitchId: TEST_DEV_TWITCH_ID,
            role: RoleType.adventurer,
            twitchPoints: 50,
        });

        const identity = await strategy.tryResolve(TEST_DEV_ACCESS_TOKEN);

        const stored = await UserModel.findById(existing._id).exec();
        expect(identity?.userId).toBe(String(existing._id));
        expect(stored?.role).toBe(RoleType.innkeeper);
        expect(stored?.twitchPoints).toBe(50);
        expect(
            await UserModel.countDocuments({ twitchId: TEST_DEV_TWITCH_ID }),
        ).toBe(1);
    });
});
