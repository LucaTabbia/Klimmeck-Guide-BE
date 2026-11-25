import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model, Types } from 'mongoose';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';
import type { LegalConsent } from 'src/users/users.service';
import { persistUser } from '../../test/fixtures';

const UserModel: Model<UserDocument> =
    mongoose.models.User || mongoose.model(User.name, UserSchema);

const DUPLICATE_KEY_ERROR_CODE = 11000;
const CONCURRENT_CALLS = 5;
const ACCEPTED_AT = new Date('2026-11-24T10:00:00.000Z');
const OLD_ACCEPTED_AT = new Date('2026-01-01T00:00:00.000Z');
const CONSENT: LegalConsent = {
    termsVersion: '2026-11-24',
    acceptedAt: ACCEPTED_AT,
};

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
            const user = await service.findOrCreateByTwitchId(
                'twitch-new-1',
                CONSENT,
            );

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
                acceptedTermsVersion: CONSENT.termsVersion,
                termsAcceptedAt: OLD_ACCEPTED_AT,
            });

            const user = await service.findOrCreateByTwitchId(
                'twitch-existing',
                CONSENT,
            );

            expect(String(user._id)).toBe(String(existing._id));
            expect(user.role).toBe(RoleType.innkeeper);
            expect(user.twitchPoints).toBe(50);
        });

        it('creates a single document under concurrent calls', async () => {
            const users = await Promise.all(
                Array.from({ length: CONCURRENT_CALLS }, () =>
                    service.findOrCreateByTwitchId('twitch-race', CONSENT),
                ),
            );

            expect(
                await UserModel.countDocuments({ twitchId: 'twitch-race' }),
            ).toBe(1);
            const ids = new Set(users.map((user) => String(user._id)));
            expect(ids.size).toBe(1);
        });
    });

    describe('findOrCreateByTwitchId consent', () => {
        function storedUser(twitchId: string) {
            return UserModel.findOne({ twitchId }).lean().exec();
        }

        it('writes the consent in the single upsert of a new user (D-09)', async () => {
            const user = await service.findOrCreateByTwitchId(
                'twitch-consent-new',
                CONSENT,
            );

            expect(user.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(user.termsAcceptedAt).toEqual(ACCEPTED_AT);
            const stored = await storedUser('twitch-consent-new');
            expect(stored?.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(stored?.termsAcceptedAt).toEqual(ACCEPTED_AT);
        });

        it('rewrites version and date only for a different version (D-09)', async () => {
            await persistUser(UserModel, {
                twitchId: 'twitch-consent-old',
                acceptedTermsVersion: 'v1',
                termsAcceptedAt: OLD_ACCEPTED_AT,
            });

            const user = await service.findOrCreateByTwitchId(
                'twitch-consent-old',
                CONSENT,
            );

            expect(user.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(user.termsAcceptedAt).toEqual(ACCEPTED_AT);
            const stored = await storedUser('twitch-consent-old');
            expect(stored?.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(stored?.termsAcceptedAt).toEqual(ACCEPTED_AT);
        });

        it('leaves the consent untouched for the same version (D-09)', async () => {
            const existing = await persistUser(UserModel, {
                twitchId: 'twitch-consent-same',
                acceptedTermsVersion: CONSENT.termsVersion,
                termsAcceptedAt: OLD_ACCEPTED_AT,
            });

            const user = await service.findOrCreateByTwitchId(
                'twitch-consent-same',
                CONSENT,
            );

            expect(user).not.toBeNull();
            expect(String(user._id)).toBe(String(existing._id));
            expect(user.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(user.termsAcceptedAt).toEqual(OLD_ACCEPTED_AT);
            const stored = await storedUser('twitch-consent-same');
            expect(stored?.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(stored?.termsAcceptedAt).toEqual(OLD_ACCEPTED_AT);
        });

        it('writes the consent of a user created before the phase at the first login (D-11)', async () => {
            await UserModel.collection.insertOne({
                twitchId: 'twitch-consent-legacy',
                twitchPoints: 5,
                role: RoleType.adventurer,
                currentCharacter: null,
            });

            const user = await service.findOrCreateByTwitchId(
                'twitch-consent-legacy',
                CONSENT,
            );

            expect(user.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(user.termsAcceptedAt).toEqual(ACCEPTED_AT);
            const stored = await storedUser('twitch-consent-legacy');
            expect(stored?.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(stored?.termsAcceptedAt).toEqual(ACCEPTED_AT);
        });

        it('keeps points, role and character when the consent is rewritten (D-09)', async () => {
            const characterId = new Types.ObjectId();
            await persistUser(UserModel, {
                twitchId: 'twitch-consent-keep',
                role: RoleType.innkeeper,
                twitchPoints: 90,
                currentCharacter: characterId,
                acceptedTermsVersion: 'v1',
                termsAcceptedAt: OLD_ACCEPTED_AT,
            });

            await service.findOrCreateByTwitchId(
                'twitch-consent-keep',
                CONSENT,
            );

            const stored = await storedUser('twitch-consent-keep');
            expect(stored?.acceptedTermsVersion).toBe(CONSENT.termsVersion);
            expect(stored?.role).toBe(RoleType.innkeeper);
            expect(stored?.twitchPoints).toBe(90);
            expect(stored?.currentCharacter).toEqual(characterId);
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
