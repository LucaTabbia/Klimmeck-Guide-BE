import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import {
    ArchiveOutcome,
    CharacterArchiver,
} from 'src/characters/deletion/character-archiver';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    buildQuest,
    persistCharacter,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const YESTERDAY = new Date('2026-10-23T10:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');

describe('CharacterArchiver.archiveWithin (replSet)', () => {
    let harness: AuthTestApp;
    let archiver: CharacterArchiver;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let quests: Model<QuestDocument>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [CharacterArchiveModule],
        });
        archiver = harness.app.get(CharacterArchiver);
        users = harness.connection.model<UserDocument>(User.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        quests = harness.connection.model<QuestDocument>(Quest.name);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([users.init(), characters.init(), quests.init()]);
    });

    afterEach(async () => {
        await harness.clearDatabase();
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    interface Scene {
        userId: Types.ObjectId;
        characterId: Types.ObjectId;
        seatedQuest: Types.ObjectId;
        openAid: Types.ObjectId;
        concludedAid: Types.ObjectId;
    }

    async function persistScene(
        characterOverrides: Record<string, unknown> = {},
    ): Promise<Scene> {
        const character = await persistCharacter(
            characters,
            characterOverrides,
        );
        const characterId = character._id as Types.ObjectId;
        const user = await persistUser(users, {
            twitchId: 'twitch-archive',
            currentCharacter: characterId,
        });
        const other = new Types.ObjectId();
        const seated = await persistQuest(quests, {
            registeredAdventurers: [
                { character: characterId, title: 'rookie' },
                { character: other, title: 'hero' },
            ],
        });
        const openAid = await persistQuest(quests, {
            infos: { ...buildQuest().infos, type: 'aid' },
            rescue: { character: characterId, failedQuest: seated._id },
            concludedAt: null,
        });
        const concludedAid = await persistQuest(quests, {
            infos: { ...buildQuest().infos, type: 'aid' },
            rescue: { character: characterId, failedQuest: seated._id },
            concludedAt: YESTERDAY,
        });
        return {
            userId: user._id as Types.ObjectId,
            characterId,
            seatedQuest: seated._id as Types.ObjectId,
            openAid: openAid._id as Types.ObjectId,
            concludedAid: concludedAid._id as Types.ObjectId,
        };
    }

    function archiveInTransaction(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
    ): Promise<ArchiveOutcome> {
        return harness.connection.transaction((session) =>
            archiver.archiveWithin(session, {
                userId,
                characterId,
                reason: DeletionReason.death,
                now: NOW,
            }),
        );
    }

    function rawUser(id: Types.ObjectId) {
        return users.collection.findOne({ _id: id });
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function rawQuest(id: Types.ObjectId) {
        return quests.collection.findOne({ _id: id });
    }

    function seatedCharacters(id: Types.ObjectId): Promise<string[]> {
        return rawQuest(id).then((quest) =>
            (quest?.registeredAdventurers ?? []).map(
                (seat: { character: unknown }) => String(seat.character),
            ),
        );
    }

    async function expectUntouched(scene: Scene): Promise<void> {
        expect((await rawCharacter(scene.characterId))?.deletedAt).toBeNull();
        expect(await seatedCharacters(scene.seatedQuest)).toContain(
            String(scene.characterId),
        );
        expect((await rawQuest(scene.openAid))?.concludedAt).toBeNull();
    }

    it('archives the character, unlinks the user, frees seats and closes open aids', async () => {
        const scene = await persistScene();

        const outcome = await archiveInTransaction(
            scene.userId,
            scene.characterId,
        );

        expect(outcome).toBe('archived');
        expect((await rawUser(scene.userId))?.currentCharacter).toBeNull();
        const archived = await rawCharacter(scene.characterId);
        expect(archived?.deletedAt).toEqual(NOW);
        expect(archived?.deletionReason).toBe('death');
        expect(await seatedCharacters(scene.seatedQuest)).not.toContain(
            String(scene.characterId),
        );
        expect(await seatedCharacters(scene.seatedQuest)).toHaveLength(1);
        expect((await rawQuest(scene.openAid))?.concludedAt).toEqual(NOW);
        expect((await rawQuest(scene.concludedAid))?.concludedAt).toEqual(
            YESTERDAY,
        );
    });

    it('matches a legacy current character saved as a hex string', async () => {
        const scene = await persistScene();
        await users.collection.updateOne(
            { _id: scene.userId },
            { $set: { currentCharacter: scene.characterId.toHexString() } },
        );

        const outcome = await archiveInTransaction(
            scene.userId,
            scene.characterId,
        );

        expect(outcome).toBe('archived');
        expect((await rawUser(scene.userId))?.currentCharacter).toBeNull();
        expect((await rawCharacter(scene.characterId))?.deletedAt).toEqual(NOW);
    });

    it('writes nothing when the caller transaction aborts after archiving', async () => {
        const scene = await persistScene();

        await expect(
            harness.connection.transaction(async (session) => {
                await archiver.archiveWithin(session, {
                    userId: scene.userId,
                    characterId: scene.characterId,
                    reason: DeletionReason.death,
                    now: NOW,
                });
                throw new Error('abort');
            }),
        ).rejects.toThrow('abort');

        expect((await rawUser(scene.userId))?.currentCharacter).toEqual(
            scene.characterId,
        );
        await expectUntouched(scene);
    });

    it('answers not-linked and writes nothing when the user points elsewhere', async () => {
        const scene = await persistScene();
        const elsewhere = new Types.ObjectId();
        await users.updateOne(
            { _id: scene.userId },
            { $set: { currentCharacter: elsewhere } },
        );

        const outcome = await archiveInTransaction(
            scene.userId,
            scene.characterId,
        );

        expect(outcome).toBe('not-linked');
        expect((await rawUser(scene.userId))?.currentCharacter).toEqual(
            elsewhere,
        );
        await expectUntouched(scene);
    });

    it('answers not-linked when the user is already unlinked', async () => {
        const scene = await persistScene();
        await users.updateOne(
            { _id: scene.userId },
            { $set: { currentCharacter: null } },
        );

        const outcome = await archiveInTransaction(
            scene.userId,
            scene.characterId,
        );

        expect(outcome).toBe('not-linked');
        await expectUntouched(scene);
    });

    it('unlinks a user pointing at an already archived character and warns with ids only', async () => {
        const warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const scene = await persistScene({
            deletedAt: ARCHIVED_AT,
            deletionReason: 'user_request',
        });

        const outcome = await archiveInTransaction(
            scene.userId,
            scene.characterId,
        );

        expect(outcome).toBe('unlinked');
        expect((await rawUser(scene.userId))?.currentCharacter).toBeNull();
        const raw = await rawCharacter(scene.characterId);
        expect(raw?.deletedAt).toEqual(ARCHIVED_AT);
        expect(raw?.deletionReason).toBe('user_request');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(scene.userId.toHexString()),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(scene.characterId.toHexString()),
        );
    });
});
