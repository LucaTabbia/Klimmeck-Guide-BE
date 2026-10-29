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
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const YESTERDAY = new Date('2026-10-23T10:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const STARTED_AT = new Date(NOW.getTime() - 60 * 60 * 1000);
const CONCURRENT_ITERATIONS = 5;

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
        sharedAid: Types.ObjectId;
        unrelatedAid: Types.ObjectId;
        concludedAid: Types.ObjectId;
        other: Types.ObjectId;
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
        const other = await persistNamedCharacter('Other Hero');
        const seated = await persistQuest(quests, {
            registeredAdventurers: [
                { character: characterId, title: 'rookie' },
                { character: other, title: 'hero' },
            ],
        });
        const aidOf = (wounded: Types.ObjectId[], concludedAt: Date | null) =>
            persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'aid' },
                rescue: { characters: wounded, failedQuest: seated._id },
                concludedAt,
            });
        const openAid = await aidOf([characterId], null);
        const sharedAid = await aidOf([characterId, other], null);
        const unrelatedAid = await aidOf([other], null);
        const concludedAid = await aidOf([characterId], YESTERDAY);
        return {
            userId: user._id as Types.ObjectId,
            characterId,
            seatedQuest: seated._id as Types.ObjectId,
            openAid: openAid._id as Types.ObjectId,
            sharedAid: sharedAid._id as Types.ObjectId,
            unrelatedAid: unrelatedAid._id as Types.ObjectId,
            concludedAid: concludedAid._id as Types.ObjectId,
            other,
        };
    }

    async function persistNamedCharacter(
        name: string,
    ): Promise<Types.ObjectId> {
        const character = await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name },
        });
        return character._id as Types.ObjectId;
    }

    async function persistLinkedCharacter(
        name: string,
        twitchId: string,
    ): Promise<{ userId: Types.ObjectId; characterId: Types.ObjectId }> {
        const characterId = await persistNamedCharacter(name);
        const user = await persistUser(users, {
            twitchId,
            currentCharacter: characterId,
        });
        return { userId: user._id as Types.ObjectId, characterId };
    }

    async function startedBoss(
        registered: Types.ObjectId[],
        concludedAt: Date | null = null,
    ): Promise<Types.ObjectId> {
        const quest = await persistQuest(quests, {
            infos: { ...buildQuest().infos, type: 'boss' },
            registeredAdventurers: registered.map((character) => ({
                character,
                title: 'rookie',
            })),
            startedAt: STARTED_AT,
            concludedAt,
        });
        return quest._id as Types.ObjectId;
    }

    function archiveInTransaction(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
        reason: DeletionReason = DeletionReason.user_request,
    ): Promise<ArchiveOutcome> {
        return harness.connection.transaction((session) =>
            archiver.archiveWithin(session, {
                userId,
                characterId,
                reason,
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

    function woundedOf(id: Types.ObjectId): Promise<string[]> {
        return rawQuest(id).then((quest) =>
            ((quest?.rescue?.characters ?? []) as unknown[]).map(String),
        );
    }

    async function expectUntouched(scene: Scene): Promise<void> {
        expect((await rawCharacter(scene.characterId))?.deletedAt).toBeNull();
        expect(await seatedCharacters(scene.seatedQuest)).toContain(
            String(scene.characterId),
        );
        expect((await rawQuest(scene.openAid))?.concludedAt).toBeNull();
        expect(await woundedOf(scene.sharedAid)).toEqual([
            String(scene.characterId),
            String(scene.other),
        ]);
    }

    it('archives the character, unlinks the user, frees seats and closes the aids left without wounded', async () => {
        const scene = await persistScene();

        const outcome = await archiveInTransaction(
            scene.userId,
            scene.characterId,
        );

        expect(outcome).toBe('archived');
        expect((await rawUser(scene.userId))?.currentCharacter).toBeNull();
        const archived = await rawCharacter(scene.characterId);
        expect(archived?.deletedAt).toEqual(NOW);
        expect(archived?.deletionReason).toBe('user_request');
        expect(await seatedCharacters(scene.seatedQuest)).not.toContain(
            String(scene.characterId),
        );
        expect(await seatedCharacters(scene.seatedQuest)).toHaveLength(1);
        expect((await rawQuest(scene.openAid))?.concludedAt).toEqual(NOW);
        expect(await woundedOf(scene.openAid)).toEqual([]);
        expect((await rawQuest(scene.concludedAid))?.concludedAt).toEqual(
            YESTERDAY,
        );
    });

    describe('death (D-12)', () => {
        it('keeps the user linked to a character archived by death until the confirmation', async () => {
            const scene = await persistScene();
            const userBefore = await rawUser(scene.userId);

            const outcome = await archiveInTransaction(
                scene.userId,
                scene.characterId,
                DeletionReason.death,
            );

            expect(outcome).toBe('archived');
            expect(await rawUser(scene.userId)).toEqual(userBefore);
            expect((await rawUser(scene.userId))?.currentCharacter).toEqual(
                scene.characterId,
            );
            const dead = await rawCharacter(scene.characterId);
            expect(dead?.deletedAt).toEqual(NOW);
            expect(dead?.deletionReason).toBe('death');
            expect(await seatedCharacters(scene.seatedQuest)).toEqual([
                String(scene.other),
            ]);
            expect((await rawQuest(scene.openAid))?.concludedAt).toEqual(NOW);
            expect(await woundedOf(scene.sharedAid)).toEqual([
                String(scene.other),
            ]);
        });

        it('answers not-linked to a death of a character the user no longer points to and writes nothing', async () => {
            const scene = await persistScene();
            const elsewhere = new Types.ObjectId();
            await users.updateOne(
                { _id: scene.userId },
                { $set: { currentCharacter: elsewhere } },
            );

            const outcome = await archiveInTransaction(
                scene.userId,
                scene.characterId,
                DeletionReason.death,
            );

            expect(outcome).toBe('not-linked');
            expect((await rawUser(scene.userId))?.currentCharacter).toEqual(
                elsewhere,
            );
            await expectUntouched(scene);
        });

        it('records no death for a character already archived and warns with ids only', async () => {
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
                DeletionReason.death,
            );

            expect(outcome).toBe('not-linked');
            expect((await rawUser(scene.userId))?.currentCharacter).toEqual(
                scene.characterId,
            );
            const raw = await rawCharacter(scene.characterId);
            expect(raw?.deletedAt).toEqual(ARCHIVED_AT);
            expect(raw?.deletionReason).toBe('user_request');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining(scene.characterId.toHexString()),
            );
        });

        // la cancellazione è la via d'uscita documentata per una morte mai confermata: nessun WARN
        it('unlinks on deletion a user still bound to a dead character at log level with ids only', async () => {
            const warnSpy = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);
            const logSpy = jest
                .spyOn(Logger.prototype, 'log')
                .mockImplementation(() => undefined);
            const scene = await persistScene({
                deletedAt: ARCHIVED_AT,
                deletionReason: 'death',
            });

            const outcome = await archiveInTransaction(
                scene.userId,
                scene.characterId,
            );

            expect(outcome).toBe('unlinked');
            expect((await rawUser(scene.userId))?.currentCharacter).toBeNull();
            const raw = await rawCharacter(scene.characterId);
            expect(raw?.deletedAt).toEqual(ARCHIVED_AT);
            expect(raw?.deletionReason).toBe('death');
            expect(warnSpy).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith(
                `Utente ${scene.userId.toHexString()} scollegato dal personaggio morto ${scene.characterId.toHexString()} senza conferma`,
            );
        });

        it('archives a dying character once under a concurrent deletion of the same character', async () => {
            for (let i = 0; i < CONCURRENT_ITERATIONS; i++) {
                const scene = await persistScene();

                const outcomes = await Promise.all([
                    archiveInTransaction(
                        scene.userId,
                        scene.characterId,
                        DeletionReason.death,
                    ),
                    archiveInTransaction(
                        scene.userId,
                        scene.characterId,
                        DeletionReason.user_request,
                    ),
                ]);

                const archived = await rawCharacter(scene.characterId);
                expect(archived?.deletedAt).toEqual(NOW);
                expect(
                    (await rawUser(scene.userId))?.currentCharacter,
                ).toBeNull();
                if (archived?.deletionReason === 'death') {
                    expect(outcomes).toEqual(['archived', 'unlinked']);
                } else {
                    expect(archived?.deletionReason).toBe('user_request');
                    expect(outcomes).toEqual(['not-linked', 'archived']);
                }
                await harness.clearDatabase();
            }
        });
    });

    describe('started quests left without anyone (utente 2026-10-25)', () => {
        it('lets a started boss without registered adventurers start again', async () => {
            const scene = await persistScene();
            const bossId = await startedBoss([scene.characterId]);

            await archiveInTransaction(scene.userId, scene.characterId);

            const boss = await rawQuest(bossId);
            expect(boss?.registeredAdventurers).toEqual([]);
            expect(boss?.startedAt).toBeNull();
        });

        it('keeps the seat of a started boss as a placeholder for the adventurers left («Il BE non libera i posti delle quest avviate»)', async () => {
            const scene = await persistScene();
            const bossId = await startedBoss([scene.characterId, scene.other]);

            await archiveInTransaction(scene.userId, scene.characterId);

            const boss = await rawQuest(bossId);
            const [archivedSeat, otherSeat] = boss?.registeredAdventurers ?? [];
            expect(boss?.registeredAdventurers).toHaveLength(2);
            expect(archivedSeat.character).toEqual(scene.characterId);
            expect(archivedSeat.archivedAt).toEqual(NOW);
            expect(otherSeat.character).toEqual(scene.other);
            expect(Object.keys(otherSeat).sort()).toEqual([
                'character',
                'title',
            ]);
            expect(boss?.startedAt).toEqual(STARTED_AT);
        });

        it('frees the seat on a quest not started yet as before (Phase 8 D-30)', async () => {
            const scene = await persistScene();

            await archiveInTransaction(scene.userId, scene.characterId);

            const seats = (await rawQuest(scene.seatedQuest))
                ?.registeredAdventurers;
            expect(seats).toHaveLength(1);
            expect(seats[0].character).toEqual(scene.other);
            expect(Object.keys(seats[0]).sort()).toEqual([
                'character',
                'title',
            ]);
        });

        it('frees the seat on a world mission, which never starts', async () => {
            const scene = await persistScene();
            const mission = await persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'worldMission' },
                registeredAdventurers: [
                    { character: scene.characterId, title: 'rookie' },
                    { character: scene.other, title: 'hero' },
                ],
                startedAt: null,
            });

            await archiveInTransaction(scene.userId, scene.characterId);

            expect(
                (await rawQuest(mission._id as Types.ObjectId))
                    ?.registeredAdventurers,
            ).toEqual([{ character: scene.other, title: 'hero' }]);
        });

        it('returns a started boss to not started once every registrant is a placeholder («Il BE non libera i posti delle quest avviate»)', async () => {
            const scene = await persistScene();
            const second = await persistLinkedCharacter(
                'Second Hero',
                'twitch-archive-second',
            );
            const bossId = await startedBoss([
                scene.characterId,
                second.characterId,
            ]);

            await archiveInTransaction(second.userId, second.characterId);
            const afterFirst = await rawQuest(bossId);
            expect(afterFirst?.registeredAdventurers).toHaveLength(2);
            expect(afterFirst?.startedAt).toEqual(STARTED_AT);

            await archiveInTransaction(scene.userId, scene.characterId);

            const boss = await rawQuest(bossId);
            expect(boss?.registeredAdventurers).toEqual([]);
            expect(boss?.startedAt).toBeNull();
        });

        it('returns a started boss to not started when both members are archived concurrently («Il BE non libera i posti delle quest avviate»)', async () => {
            for (
                let iteration = 0;
                iteration < CONCURRENT_ITERATIONS;
                iteration++
            ) {
                await harness.clearDatabase();
                const first = await persistLinkedCharacter(
                    `First Hero ${iteration}`,
                    `twitch-archive-first-${iteration}`,
                );
                const second = await persistLinkedCharacter(
                    `Second Hero ${iteration}`,
                    `twitch-archive-second-${iteration}`,
                );
                const bossId = await startedBoss([
                    first.characterId,
                    second.characterId,
                ]);

                const outcomes = await Promise.all([
                    archiveInTransaction(first.userId, first.characterId),
                    archiveInTransaction(second.userId, second.characterId),
                ]);

                expect(outcomes).toEqual(['archived', 'archived']);
                const boss = await rawQuest(bossId);
                expect(boss?.registeredAdventurers).toEqual([]);
                expect(boss?.startedAt).toBeNull();
            }
        });

        it('returns a started boss to not started when the other registrant is a dangling id', async () => {
            const scene = await persistScene();
            const bossId = await startedBoss([
                scene.characterId,
                new Types.ObjectId(),
            ]);

            await archiveInTransaction(scene.userId, scene.characterId);

            const boss = await rawQuest(bossId);
            expect(boss?.registeredAdventurers).toEqual([]);
            expect(boss?.startedAt).toBeNull();
        });

        it('returns a started aid with archived rescuers only to not started and keeps its wounded', async () => {
            const scene = await persistScene();
            const aid = await persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'aid' },
                rescue: {
                    characters: [scene.other],
                    failedQuest: scene.seatedQuest,
                },
                registeredAdventurers: [
                    { character: scene.characterId, title: 'rookie' },
                ],
                startedAt: STARTED_AT,
                concludedAt: null,
            });

            await archiveInTransaction(scene.userId, scene.characterId);

            const raw = await rawQuest(aid._id as Types.ObjectId);
            expect(raw?.startedAt).toBeNull();
            expect(raw?.registeredAdventurers).toEqual([]);
            expect(raw?.rescue?.characters).toEqual([scene.other]);
            expect(raw?.concludedAt).toBeNull();
        });

        it('leaves alone a started quest the character was not registered on', async () => {
            const scene = await persistScene();
            const foreignId = await startedBoss([]);

            await archiveInTransaction(scene.userId, scene.characterId);

            expect((await rawQuest(foreignId))?.startedAt).toEqual(STARTED_AT);
        });

        it('leaves a concluded quest untouched', async () => {
            const scene = await persistScene();
            const bossId = await startedBoss([scene.characterId], YESTERDAY);

            await archiveInTransaction(scene.userId, scene.characterId);

            const boss = await rawQuest(bossId);
            expect(boss?.startedAt).toEqual(STARTED_AT);
            expect(boss?.concludedAt).toEqual(YESTERDAY);
            expect(boss?.registeredAdventurers).toEqual([
                { character: scene.characterId, title: 'rookie' },
            ]);
        });
    });

    it('keeps an aid with two wounded open for the one left to rescue', async () => {
        const scene = await persistScene();

        await archiveInTransaction(scene.userId, scene.characterId);

        expect(await woundedOf(scene.sharedAid)).toEqual([String(scene.other)]);
        expect((await rawQuest(scene.sharedAid))?.concludedAt).toBeNull();
    });

    it('leaves untouched an aid that does not rescue the archived character', async () => {
        const scene = await persistScene();

        await archiveInTransaction(scene.userId, scene.characterId);

        expect(await woundedOf(scene.unrelatedAid)).toEqual([
            String(scene.other),
        ]);
        expect((await rawQuest(scene.unrelatedAid))?.concludedAt).toBeNull();
        expect(await woundedOf(scene.concludedAid)).toEqual([
            String(scene.characterId),
        ]);
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
        const bossId = await startedBoss([scene.characterId, scene.other]);

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
        const boss = await rawQuest(bossId);
        expect(boss?.registeredAdventurers).toEqual([
            { character: scene.characterId, title: 'rookie' },
            { character: scene.other, title: 'rookie' },
        ]);
        expect(boss?.startedAt).toEqual(STARTED_AT);
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
