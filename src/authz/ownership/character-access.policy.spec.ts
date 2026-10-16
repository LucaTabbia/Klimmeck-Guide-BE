import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthorizationErrorCode } from 'src/authz/authorization-error-code.enum';
import { AuthorizationException } from 'src/authz/authorization.exception';
import { CharacterAccessPolicy } from 'src/authz/ownership/character-access.policy';
import {
    OwnedResource,
    ResourceAccess,
} from 'src/authz/ownership/owned-resource';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { RoleType } from 'src/models/enums/role-type.enum';

const OWN_ID = '64b000000000000000000001';
const FOREIGN_ID = '64b000000000000000000002';
const USER_ID = '64b0000000000000000000aa';
const PQ_ID = '64b0000000000000000000b1';
const FOREIGN_PQ_ID = '64b0000000000000000000b2';

function buildIdentity(role: RoleType = RoleType.adventurer): AuthIdentity {
    return { userId: USER_ID, twitchId: 'twitch-1', role };
}

describe('CharacterAccessPolicy', () => {
    let userDoc: { currentCharacter: Types.ObjectId | null } | null;
    let userModel: { findById: jest.Mock };
    let characterDoc: {
        quests: { pendingQuest: Types.ObjectId | null };
    } | null;
    let characterModel: { exists: jest.Mock; findOne: jest.Mock };
    let pendingQuestModel: { exists: jest.Mock };
    let policy: CharacterAccessPolicy;

    beforeEach(() => {
        userDoc = { currentCharacter: new Types.ObjectId(OWN_ID) };
        userModel = {
            findById: jest.fn().mockImplementation(() => ({
                lean: () => ({ exec: () => Promise.resolve(userDoc) }),
            })),
        };
        characterDoc = {
            quests: { pendingQuest: new Types.ObjectId(PQ_ID) },
        };
        characterModel = {
            exists: jest
                .fn()
                .mockResolvedValue({ _id: new Types.ObjectId(FOREIGN_ID) }),
            findOne: jest.fn().mockImplementation(() => ({
                lean: () => ({ exec: () => Promise.resolve(characterDoc) }),
            })),
        };
        pendingQuestModel = {
            exists: jest
                .fn()
                .mockResolvedValue({ _id: new Types.ObjectId(FOREIGN_PQ_ID) }),
        };
        policy = new CharacterAccessPolicy(
            userModel as never,
            characterModel as never,
            pendingQuestModel as never,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('authorizeCharacter', () => {
        it('grants owner access to the adventurer that owns the character with a single user read', async () => {
            await expect(
                policy.authorizeCharacter(buildIdentity(), OWN_ID),
            ).resolves.toBe(ResourceAccess.owner);
            expect(userModel.findById).toHaveBeenCalledTimes(1);
            expect(userModel.findById).toHaveBeenCalledWith(USER_ID, {
                currentCharacter: 1,
            });
            expect(characterModel.exists).not.toHaveBeenCalled();
        });

        it('grants owner access to the innkeeper on its own character', async () => {
            await expect(
                policy.authorizeCharacter(
                    buildIdentity(RoleType.innkeeper),
                    OWN_ID,
                ),
            ).resolves.toBe(ResourceAccess.owner);
        });

        it('grants on-behalf access to the innkeeper on a foreign character without an existence check', async () => {
            await expect(
                policy.authorizeCharacter(
                    buildIdentity(RoleType.innkeeper),
                    FOREIGN_ID,
                ),
            ).resolves.toBe(ResourceAccess.onBehalf);
            expect(userModel.findById).toHaveBeenCalledTimes(1);
            expect(characterModel.exists).not.toHaveBeenCalled();
        });

        it('forbids an adventurer acting on an existing foreign character', async () => {
            const result = policy.authorizeCharacter(
                buildIdentity(),
                FOREIGN_ID,
            );

            await expect(result).rejects.toBeInstanceOf(AuthorizationException);
            await expect(result).rejects.toMatchObject({
                code: AuthorizationErrorCode.FORBIDDEN,
            });
            expect(userModel.findById).toHaveBeenCalledTimes(1);
        });

        it('reports a missing character as not found for an adventurer', async () => {
            characterModel.exists.mockResolvedValue(null);

            const result = policy.authorizeCharacter(
                buildIdentity(),
                FOREIGN_ID,
            );

            await expect(result).rejects.toBeInstanceOf(
                ResourceNotFoundException,
            );
            await expect(result).rejects.toMatchObject({
                code: AuthorizationErrorCode.NOT_FOUND,
            });
            expect(characterModel.exists).toHaveBeenCalledWith({
                _id: FOREIGN_ID,
                deletedAt: null,
            });
        });

        it('reports an archived character as not found for its former owner', async () => {
            userDoc = { currentCharacter: null };
            characterModel.exists.mockResolvedValue(null);

            const result = policy.authorizeCharacter(
                buildIdentity(),
                FOREIGN_ID,
            );

            await expect(result).rejects.toBeInstanceOf(
                ResourceNotFoundException,
            );
            await expect(result).rejects.toMatchObject({
                code: AuthorizationErrorCode.NOT_FOUND,
            });
            expect(characterModel.exists).toHaveBeenCalledWith({
                _id: FOREIGN_ID,
                deletedAt: null,
            });
        });

        it('treats the guard role as an adventurer', async () => {
            await expect(
                policy.authorizeCharacter(
                    buildIdentity(RoleType.guard),
                    FOREIGN_ID,
                ),
            ).rejects.toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
        });

        it('forbids a user without a character from acting on an existing one', async () => {
            userDoc = { currentCharacter: null };

            await expect(
                policy.authorizeCharacter(buildIdentity(), FOREIGN_ID),
            ).rejects.toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
        });

        it('forbids a caller whose user document no longer exists', async () => {
            userDoc = null;

            await expect(
                policy.authorizeCharacter(buildIdentity(), FOREIGN_ID),
            ).rejects.toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
        });

        it.each([
            ['abc', RoleType.adventurer],
            ['aaaaaaaaaaaa', RoleType.adventurer],
            ['abc', RoleType.innkeeper],
            ['aaaaaaaaaaaa', RoleType.innkeeper],
        ])(
            'reports the malformed id %s as not found for %s without reading',
            async (id, role) => {
                await expect(
                    policy.authorizeCharacter(buildIdentity(role), id),
                ).rejects.toMatchObject({
                    code: AuthorizationErrorCode.NOT_FOUND,
                });
                expect(userModel.findById).not.toHaveBeenCalled();
                expect(characterModel.exists).not.toHaveBeenCalled();
            },
        );
    });

    describe('authorizePendingQuest', () => {
        it('grants owner access to the adventurer whose character holds the pending quest', async () => {
            await expect(
                policy.authorizePendingQuest(buildIdentity(), PQ_ID),
            ).resolves.toBe(ResourceAccess.owner);
            expect(userModel.findById).toHaveBeenCalledTimes(1);
            expect(characterModel.findOne).toHaveBeenCalledTimes(1);
            expect(characterModel.findOne).toHaveBeenCalledWith(
                { _id: OWN_ID, deletedAt: null },
                { 'quests.pendingQuest': 1 },
            );
            expect(pendingQuestModel.exists).not.toHaveBeenCalled();
        });

        it('forbids an adventurer reading an existing foreign pending quest', async () => {
            const result = policy.authorizePendingQuest(
                buildIdentity(),
                FOREIGN_PQ_ID,
            );

            await expect(result).rejects.toBeInstanceOf(AuthorizationException);
            await expect(result).rejects.toMatchObject({
                code: AuthorizationErrorCode.FORBIDDEN,
                message: 'Questa missione non ti appartiene',
            });
            expect(pendingQuestModel.exists).toHaveBeenCalledWith({
                _id: FOREIGN_PQ_ID,
            });
        });

        it('reports a missing pending quest as not found for an adventurer', async () => {
            pendingQuestModel.exists.mockResolvedValue(null);

            const result = policy.authorizePendingQuest(
                buildIdentity(),
                FOREIGN_PQ_ID,
            );

            await expect(result).rejects.toBeInstanceOf(
                ResourceNotFoundException,
            );
            await expect(result).rejects.toMatchObject({
                code: AuthorizationErrorCode.NOT_FOUND,
            });
        });

        it('forbids an adventurer without a character without reading characters', async () => {
            userDoc = { currentCharacter: null };

            await expect(
                policy.authorizePendingQuest(buildIdentity(), PQ_ID),
            ).rejects.toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
            expect(characterModel.findOne).not.toHaveBeenCalled();
        });

        it('forbids an adventurer whose character has no pending quest', async () => {
            characterDoc = { quests: { pendingQuest: null } };

            await expect(
                policy.authorizePendingQuest(buildIdentity(), PQ_ID),
            ).rejects.toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
        });

        it('grants on-behalf access to the innkeeper without any read', async () => {
            await expect(
                policy.authorizePendingQuest(
                    buildIdentity(RoleType.innkeeper),
                    FOREIGN_PQ_ID,
                ),
            ).resolves.toBe(ResourceAccess.onBehalf);
            expect(userModel.findById).not.toHaveBeenCalled();
            expect(characterModel.findOne).not.toHaveBeenCalled();
            expect(pendingQuestModel.exists).not.toHaveBeenCalled();
        });

        it.each([RoleType.adventurer, RoleType.innkeeper])(
            'reports a malformed id as not found for %s without reading',
            async (role) => {
                await expect(
                    policy.authorizePendingQuest(buildIdentity(role), 'abc'),
                ).rejects.toMatchObject({
                    code: AuthorizationErrorCode.NOT_FOUND,
                });
                expect(userModel.findById).not.toHaveBeenCalled();
                expect(characterModel.findOne).not.toHaveBeenCalled();
                expect(pendingQuestModel.exists).not.toHaveBeenCalled();
            },
        );

        it('treats the guard role as an adventurer', async () => {
            await expect(
                policy.authorizePendingQuest(
                    buildIdentity(RoleType.guard),
                    FOREIGN_PQ_ID,
                ),
            ).rejects.toMatchObject({ code: AuthorizationErrorCode.FORBIDDEN });
        });
    });

    describe('authorize', () => {
        it('delegates the pending quest resource to authorizePendingQuest', async () => {
            await expect(
                policy.authorize(
                    buildIdentity(),
                    OwnedResource.pendingQuest,
                    PQ_ID,
                ),
            ).resolves.toBe(ResourceAccess.owner);
            expect(characterModel.findOne).toHaveBeenCalledTimes(1);
        });

        it('delegates the character resource to authorizeCharacter', async () => {
            await expect(
                policy.authorize(
                    buildIdentity(),
                    OwnedResource.character,
                    OWN_ID,
                ),
            ).resolves.toBe(ResourceAccess.owner);
            expect(userModel.findById).toHaveBeenCalledTimes(1);
        });

        it('fails closed on a resource the policy does not cover', () => {
            expect(() =>
                policy.authorize(
                    buildIdentity(),
                    'Unknown' as OwnedResource,
                    OWN_ID,
                ),
            ).toThrow('Risorsa non supportata dalla policy');
        });
    });

    describe('mayReceiveCharacterEvent', () => {
        it('lets the innkeeper receive every event without reading', async () => {
            await expect(
                policy.mayReceiveCharacterEvent(
                    buildIdentity(RoleType.innkeeper),
                    FOREIGN_ID,
                ),
            ).resolves.toBe(true);
            expect(userModel.findById).not.toHaveBeenCalled();
        });

        it('lets the owner receive the events of its character', async () => {
            await expect(
                policy.mayReceiveCharacterEvent(buildIdentity(), OWN_ID),
            ).resolves.toBe(true);
        });

        it('filters out the events of a foreign character', async () => {
            await expect(
                policy.mayReceiveCharacterEvent(buildIdentity(), FOREIGN_ID),
            ).resolves.toBe(false);
        });

        it('filters out every event for a user without a character', async () => {
            userDoc = { currentCharacter: null };

            await expect(
                policy.mayReceiveCharacterEvent(buildIdentity(), OWN_ID),
            ).resolves.toBe(false);
        });

        it('fails closed and logs a warning when the user read rejects', async () => {
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);
            userModel.findById.mockImplementation(() => ({
                lean: () => ({
                    exec: () => Promise.reject(new Error('connection lost')),
                }),
            }));

            await expect(
                policy.mayReceiveCharacterEvent(buildIdentity(), OWN_ID),
            ).resolves.toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
        });
    });
});
