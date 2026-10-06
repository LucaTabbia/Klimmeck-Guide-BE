import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { TwitchIdIndexVerifier } from 'src/users/twitch-id-index.verifier';
import { UsersService } from 'src/users/users.service';

const UserModel: Model<UserDocument> =
    mongoose.models.User || mongoose.model(User.name, UserSchema);

const DUPLICATED_USERS = [
    { twitchId: 'twitch-dup-1', twitchPoints: 0, role: 'adventurer' },
    { twitchId: 'twitch-dup-1', twitchPoints: 0, role: 'adventurer' },
    { twitchId: 'twitch-ok-1', twitchPoints: 0, role: 'adventurer' },
];

describe('TwitchIdIndexVerifier (replSet)', () => {
    let usersService: UsersService;
    let verifier: TwitchIdIndexVerifier;
    let errorSpy: jest.SpyInstance;

    beforeAll(async () => {
        await UserModel.init();
        const moduleRef = await Test.createTestingModule({
            providers: [
                UsersService,
                TwitchIdIndexVerifier,
                { provide: getModelToken(User.name), useValue: UserModel },
            ],
        }).compile();
        usersService = moduleRef.get(UsersService);
        verifier = moduleRef.get(TwitchIdIndexVerifier);
    });

    beforeEach(() => {
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        errorSpy.mockRestore();
        await UserModel.deleteMany({});
        await UserModel.createIndexes();
    });

    async function insertDuplicatesWithoutIndex(): Promise<void> {
        await UserModel.collection.dropIndexes();
        await UserModel.collection.insertMany(
            DUPLICATED_USERS.map((user) => ({ ...user })),
        );
    }

    describe('UsersService.findDuplicateTwitchIds', () => {
        it('lists every twitchId stored more than once', async () => {
            await insertDuplicatesWithoutIndex();

            await expect(
                usersService.findDuplicateTwitchIds(),
            ).resolves.toEqual([{ twitchId: 'twitch-dup-1', count: 2 }]);
        });

        it('returns an empty list without duplicates', async () => {
            await UserModel.create({
                twitchId: 'twitch-ok-1',
                twitchPoints: 0,
                role: 'adventurer',
            });

            await expect(
                usersService.findDuplicateTwitchIds(),
            ).resolves.toEqual([]);
        });
    });

    describe('onApplicationBootstrap', () => {
        it('logs nothing when the unique index can be built', async () => {
            await verifier.onApplicationBootstrap();

            expect(errorSpy).not.toHaveBeenCalled();
        });

        it('logs the duplicated twitchIds without throwing when the index cannot be built', async () => {
            await insertDuplicatesWithoutIndex();

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const [message] = errorSpy.mock.calls[0] as [string];
            expect(message).toContain('users.twitchId');
            expect(message).toContain('twitch-dup-1 (2)');
            expect(message).not.toContain('twitch-ok-1');
        });

        it('logs the real cause without blaming duplicates when the index fails for another reason (IN-03)', async () => {
            const indexFailure = Object.assign(new Error('not authorized'), {
                name: 'MongoServerError',
                code: 13,
            });
            jest.spyOn(UserModel, 'createIndexes').mockRejectedValueOnce(
                indexFailure,
            );
            const findDuplicates = jest.spyOn(
                usersService,
                'findDuplicateTwitchIds',
            );

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(findDuplicates).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledTimes(1);
            const [message] = errorSpy.mock.calls[0] as [string];
            expect(message).toContain('MongoServerError');
            expect(message).toContain('13');
            expect(message).not.toContain('Duplicated twitchId');
            findDuplicates.mockRestore();
        });

        it('never throws at boot when the duplicates cannot be listed (IN-03)', async () => {
            await insertDuplicatesWithoutIndex();
            const findDuplicates = jest
                .spyOn(usersService, 'findDuplicateTwitchIds')
                .mockRejectedValueOnce(new Error('aggregate failed'));

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const [message] = errorSpy.mock.calls[0] as [string];
            expect(message).toContain('users.twitchId');
            findDuplicates.mockRestore();
        });
    });
});
