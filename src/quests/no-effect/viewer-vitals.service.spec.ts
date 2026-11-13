import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import type { CharacterDocument } from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { UserDocument } from 'src/models/user.model';
import { ViewerVitalsService } from './viewer-vitals.service';

const USER_ID = new Types.ObjectId();
const CHARACTER_ID = new Types.ObjectId();

const leanOf = (value: unknown) => ({
    lean: () => ({ exec: () => Promise.resolve(value) }),
});

function vitalsWith(user: unknown, character: unknown) {
    const findById = jest.fn(() => leanOf(user));
    const findOne = jest.fn(() => leanOf(character));
    const service = new ViewerVitalsService(
        { findById } as unknown as Model<UserDocument>,
        { findOne } as unknown as Model<CharacterDocument>,
    );
    return { service, findById, findOne };
}

const playerIdentity = (userId = USER_ID.toHexString()): AuthIdentity => ({
    userId,
    twitchId: 'twitch-vitals',
    role: RoleType.adventurer,
});

const userWithCharacter = { currentCharacter: CHARACTER_ID };

describe('ViewerVitalsService', () => {
    it('answers null without reading for a request without identity (D-25)', async () => {
        const { service, findById, findOne } = vitalsWith(
            userWithCharacter,
            null,
        );

        await expect(service.of(undefined, {})).resolves.toBeNull();
        expect(findById).not.toHaveBeenCalled();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('answers null without reading for a malformed user id (D-25)', async () => {
        const { service, findById } = vitalsWith(userWithCharacter, null);

        await expect(
            service.of(playerIdentity('not-an-id'), {}),
        ).resolves.toBeNull();
        expect(findById).not.toHaveBeenCalled();
    });

    it('answers null for a user without a current character (D-25)', async () => {
        const { service, findOne } = vitalsWith({}, null);

        await expect(service.of(playerIdentity(), {})).resolves.toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('answers null when the current character is not active (D-25)', async () => {
        const { service, findOne } = vitalsWith(userWithCharacter, null);

        await expect(service.of(playerIdentity(), {})).resolves.toBeNull();
        expect(findOne).toHaveBeenCalledTimes(1);
    });

    it('reads a legacy character without injuries as an empty list (D-25)', async () => {
        const { service } = vitalsWith(userWithCharacter, {
            status: {
                title: TitleType.rookie,
                xp: 0,
                currentLifePoints: 400,
                maxLifePoints: 1000,
            },
        });

        await expect(service.of(playerIdentity(), {})).resolves.toEqual({
            title: TitleType.rookie,
            currentLifePoints: 400,
            maxLifePoints: 1000,
            injuries: [],
        });
    });

    it('returns the viewer title with the vitals in one read (D-18)', async () => {
        const { service, findOne } = vitalsWith(userWithCharacter, {
            status: {
                title: TitleType.mage,
                xp: 0,
                currentLifePoints: 300,
                maxLifePoints: 1000,
                injuries: ['deepCut'],
            },
        });
        const event = {};
        const identity = playerIdentity();

        const first = await service.of(identity, event);
        const second = await service.of(identity, event);

        expect(first).toEqual({
            title: TitleType.mage,
            currentLifePoints: 300,
            maxLifePoints: 1000,
            injuries: ['deepCut'],
        });
        expect(second).toBe(first);
        expect(findOne).toHaveBeenCalledTimes(1);
    });

    it('reads once per viewer within the same request and again in another one (D-25)', async () => {
        const { service, findById } = vitalsWith(userWithCharacter, null);
        const request = {};
        const identity = playerIdentity();

        await service.of(identity, request);
        await service.of(identity, request);
        await service.of(identity, {});

        expect(findById).toHaveBeenCalledTimes(2);
    });
});
