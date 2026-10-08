import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';
import { persistUser } from '../../test/fixtures';

const UserModel: Model<UserDocument> =
    mongoose.models.User || mongoose.model(User.name, UserSchema);

const DUPLICATE_KEY_ERROR_CODE = 11000;
const CONCURRENT_CALLS = 5;

describe('UsersService identity upserts (replSet)', () => {
    let service: UsersService;

    beforeAll(async () => {
        await UserModel.init();
        const moduleRef = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: getModelToken(User.name), useValue: UserModel },
            ],
        }).compile();
        service = moduleRef.get(UsersService);
    });

    describe('findOrCreateByTwitchId', () => {
        it('creates a new adventurer with zero points and no character', async () => {
            const user = await service.findOrCreateByTwitchId('twitch-new-1');

            expect(user.twitchId).toBe('twitch-new-1');
            expect(user.role).toBe(RoleType.adventurer);
            expect(user.twitchPoints).toBe(0);
            expect(user.currentCharacter).toBeNull();
            expect(await UserModel.countDocuments()).toBe(1);
        });

        it('returns the existing user untouched', async () => {
            const existing = await persistUser(UserModel, {
                twitchId: 'twitch-existing',
                role: RoleType.innkeeper,
                twitchPoints: 50,
            });

            const user =
                await service.findOrCreateByTwitchId('twitch-existing');

            expect(String(user._id)).toBe(String(existing._id));
            expect(user.role).toBe(RoleType.innkeeper);
            expect(user.twitchPoints).toBe(50);
        });

        it('creates a single document under concurrent calls', async () => {
            const users = await Promise.all(
                Array.from({ length: CONCURRENT_CALLS }, () =>
                    service.findOrCreateByTwitchId('twitch-race'),
                ),
            );

            expect(
                await UserModel.countDocuments({ twitchId: 'twitch-race' }),
            ).toBe(1);
            const ids = new Set(users.map((user) => String(user._id)));
            expect(ids.size).toBe(1);
        });
    });

    describe('upsertWithRole', () => {
        it('creates the user with the given role', async () => {
            const user = await service.upsertWithRole(
                'dev-twitch-1',
                RoleType.innkeeper,
            );

            expect(user.twitchId).toBe('dev-twitch-1');
            expect(user.role).toBe(RoleType.innkeeper);
            expect(user.twitchPoints).toBe(0);
            expect(user.currentCharacter).toBeNull();
        });

        it('updates only the role of an existing user', async () => {
            const existing = await persistUser(UserModel, {
                twitchId: 'dev-twitch-1',
                role: RoleType.adventurer,
                twitchPoints: 50,
            });

            const user = await service.upsertWithRole(
                'dev-twitch-1',
                RoleType.innkeeper,
            );

            expect(String(user._id)).toBe(String(existing._id));
            expect(user.role).toBe(RoleType.innkeeper);
            expect(user.twitchPoints).toBe(50);
        });
    });

    describe('twitchId unique index', () => {
        it('rejects a second user with the same twitchId', async () => {
            await persistUser(UserModel, { twitchId: 'twitch-dup' });

            await expect(
                persistUser(UserModel, { twitchId: 'twitch-dup' }),
            ).rejects.toMatchObject({ code: DUPLICATE_KEY_ERROR_CODE });
        });
    });
});
